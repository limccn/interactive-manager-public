const express = require('express')
const bodyParser = require('body-parser')
const ejs = require('ejs')

const tcp = require('@cloudbase/node-sdk')
const config = require('./config')

const cloud =tcp.init({
    env: config.env,
    secretId: config.secretId,
    secretKey: config.secretKey,
    timeout: config.timeout,
  })
const db = cloud.database({timeout:config.timeout})
const $ = db.command.aggregate
const _ = db.command
const app = express()
const http = require("http").createServer(app)
const socket = require('socket.io')(http)


const cookieSession = require('cookie-session')
const router = express.Router()

const SessionFilter=require('./filter/session-filter.js')
const sessionFilter=new SessionFilter()

app.use(bodyParser.json())
app.use('/public', express.static('public'))
app.set('views', __dirname+'/views/')
app.engine('html', ejs.__express)
app.set('view engine', 'html')
app.use(cookieSession({//设置session
    name:'session',
    keys: ['key']
}))

app.post('/login/',function(req,res){
    var username=req.body.userName
    var password=req.body.passWord
    if(username!== config.username ||password!==config.password) 
    {   
        res.send({
            success:false
        })
        return
    }
    var user={
        name: username,
        pwd: password,
    }
    req.session.user=user
    res.send({
        success:true
    })
})

app.post('/init/',async function(req,res){

    //备份前先将状态设置为准备中
    await db.collection('Message').doc('ALL').update(
        {
            activity_id:'003',
            can_join: false,
            processing_number:1,
        }
    )

    await db.collection('Staff').where({_id:_.neq('')}).update({
        prize_id:0,
        prize_name:"",
        times:3,
        winning:false,
    })

    res.send({
        success:true
    })
})

app.post('/backup/',async function(req,res){

    let count = await db.collection('BackupList').count()
    count = count.total + 1
    await db.collection('BackupList').add({
        _id:count,
        time:new Date(),
    })

    //备份前先将状态设置为准备中
    await db.collection('Message').doc('ALL').update(
        {
            activity_id:'003',
            can_join: false,
        }
    )

    await db.createCollection('MessageBackup' + count)
    await backupCollectionData('Message','MessageBackup' + count)

    await db.createCollection('StaffBackup' + count)
    await backupCollectionData('Staff','StaffBackup' + count)

    await db.createCollection('ProcessingStaffBackup'+ count)
    await backupCollectionData('ProcessingStaff','ProcessingStaffBackup' + count)

    res.send({
        success:true
    })
})

app.post('/reshore/',async function(req,res){

    let id = req.body.id

    await reshoreCollectionData('Message','MessageBackup' + id)

    await reshoreCollectionData('Staff','StaffBackup' + id)

    await reshoreCollectionData('ProcessingStaff','ProcessingStaffBackup' + id)

    res.send({
        success:true
    })
})

app.get('/reshorelist/',async function(req,res){
    let data={}
    await db.collection('BackupList').get().then(result=>{
        for(let i=0;i<result.data.length;i++){
            data[i]=result.data[i]
        }
    })
    res.send({
        list:data
    })
})

async function backupCollectionData(collection,backupName) {
    let count = await db.collection(collection).count()
    count = count.total
    for (let i = 0; i < count; i += 100) {
        let data = await getCollectionData(collection,i)
        for(let j=0;j< data.length;j++){
            await db.collection(backupName).add(data[j])
        }
    }
}

async function reshoreCollectionData(collection,backupName) {
    let count = await db.collection(backupName).count()
    count = count.total
    await db.collection(collection).where({_id:_.neq('')}).remove()
    for (let i = 0; i < count; i += 100) {
        let data = await getCollectionData(backupName,i)
        for(let j=0;j< data.length;j++){
            await db.collection(collection).add(data[j])
        }
    }
}

async function getCollectionData(collection,skip) {
    const list = await db.collection(collection).skip(skip).get()
    return list.data
}

app.get('*',function(req,res,next){
    sessionFilter.doFilter(req,res,next)
})


async function sendCount(){
    await db.collection('Message').get()
    .then(res=>{
        let result ={
            processing_number:0,
            ohs:0,
            jhg:0,
        }
        for(var i=0;i<res.data.length;i++){
            switch(res.data[i]._id){
                case 'ALL':
                    result.processing_number = res.data[i].processing_number
                    break
                case 'OHS':
                    result.ohs = res.data[i].processing_count
                    break
                case 'JHG':
                    result.jhg = res.data[i].processing_count
                    break   
            }
        }
        socket.emit('tok',result)
    })
}

socket.on('connection',function (client) {
   client.on('tik',function () {
     sendCount()
   }),
  /**断开连接**/
  client.on('disconnect',function () {
  })
})

//画面请求API
app.get('/activity/',async (req, res) => {
    console.log(`activity`)
    await db.collection('Message').doc('ALL').get().then(result=>{
        res.send({
            activity_id: result.data[0].activity_id,
            can_join: result.data[0].can_join,
            processing_number: result.data[0].processing_number,
            prize_name: result.data[0].prize,
        })
    }).catch(err=>{
        res.send({})
    })
})

async function getProcessingStaffList(where) {
    let count = await db.collection('ProcessingStaff').where(where).count()
    count = count.total
    let staffs = new Array()
    for (let i = 0; i < count; i += 100) {
        let result = await db.collection('ProcessingStaff').field({ staff_id: true,name: true,avatar: true }).where(where).orderBy("staff_id","asc").skip(i).get()
        staffs = staffs.concat(result.data)
    }
    return staffs
}

app.get('/processing_staff/',async (req, res) => {
    
    let company = req.query['company']
    let staffs = new Array()

    let processing_number = req.query['processing_number']

    if(processing_number!==undefined){
        processing_number = Number(processing_number)
    }
    else{
        await db.collection('Message').doc('ALL').get().then(result=>{
            processing_number = result.data[0].processing_number
        })
    }
    
    //抽取所有未中奖的员工
    // 一等奖、特等奖不带部长和新员工
    if(processing_number > 12){
        let count =await getStaffCount({
            prize_id: 0,
            is_manager:false,
            is_fresh:false,
            company: company,
        });
        count = count.total
        for (let i = 0; i < count; i += 20) {
            staffs = staffs.concat(await getStaffList({
                prize_id: 0,
                is_manager:false,
                is_fresh:false,
                company: company,
            },i))
        }
    }
    else{
        let count =await getStaffCount({
            prize_id: 0,
            company: company,
        });
        count = count.total
        for (let i = 0; i < count; i += 20) {
            staffs = staffs.concat(await getStaffList({
                prize_id: 0,
                company: company,
            },i))
        }
    }
    ////================================================
    ////二等奖抽奖阶段，只有报名的才能参加
    //if(processing_number<=12){
    //    staffs = await getProcessingStaffList(
    //        {
    //        company: company,
    //        processing_number: processing_number,
    //    })
    //}
    ////大奖阶段
    //else if(processing_number<=14){
    //    //抽取所有未中奖的员工
    //    let count =await getStaffCount({
    //        prize_id: 0,
    //        company: company,
    //    });
    //    count = count.total
    //    for (let i = 0; i < count; i += 20) {
    //        staffs = staffs.concat(await getStaffList({
    //            prize_id: 0,
    //            company: company,
    //      },i))
    //    }
    //}
    //返场奖阶段
    //else{
    //    //抽取所有未中奖的员工（两个公司的所有员工）
    //    let count =await getStaffCount({
    //        prize_id: 0,
    //    });
    //    count = count.total
    //    for (let i = 0; i < count; i += 20) {
    //        staffs = staffs.concat(await getStaffList({
    //            prize_id: 0,
    //      },i))
    //    }
    //}

    //================================================
    
    res.send(staffs)

})

async function getStaffCount(where) {
    let count = await db.collection('Staff').where(where).count()
    return count;
}
async function getStaffList(where,skip) {
    let list = await db.collection('Staff')
    .aggregate()
    .addFields({
      staff_id : '$_id'
    })
    .match(where)
    .sort({_id: 1}).skip(skip)
    .project({ 
      _id: 0,
      staff_id: 1,
      name: 1,
      avatar: 1,
    }).end()
    return list.data
}

app.get('/shooting_staff/',async (req, res) => {
    let staffs = new Array()
    await db.collection('ProcessingStaff').where({
        company: req.query['company'],
        processing_number: Number(req.query['processing_number']),
        shooting:true,
    }).orderBy("staff_id","asc").get().then(result=>{
        for(var i=0;i<result.data.length;i++){
            staffs[i]={
                staff_id: result.data[i].staff_id,
                name: result.data[i].name,
                avatar: result.data[i].avatar,
                winning: result.data[i].winning,
            }
        }
    })
    res.send(staffs)
})

app.get('/staffs/',async (req, res) => {
    console.log(`staffs`,req.query)
    let staffs = new Array()
    let where = {}
    if(req.query.company!==undefined){
        where.company = req.query.company
    }
    if(req.query.is_bse!==undefined){
        where.is_bse = Boolean(req.query.is_bse)
    }
    if(!isNaN(Number(req.query.times))){
        where.times = Number(req.query.times)
    }
    if(req.query.winning=='true'){
        where.winning = true
    }

    let count =await getStaffCount(where)
    count = count.total
    
    for (let i = 0; i < count; i += 100) {
        staffs = staffs.concat(await getStaffFullinfoList(where,i))
    }
    res.send(staffs)
})

async function getStaffFullinfoList(where,skip) {
    const list = await db.collection('Staff').where(where).orderBy('_id','asc').skip(skip).get()
    return list.data
}

app.get('/prizes/',async (req, res) => {
    let prizes = new Array()
    await db.collection('Prize')
        .orderBy('_id','asc').get().then(result=>{
        for(var i=0;i<result.data.length;i++){
            prizes[i]={
            prize_id: result.data[i]._id,
            prize_name: result.data[i].prize_name,
            }
        }
    })

    res.send(prizes)
})


app.post('/message/',async(req, res) => {
    console.log(`message`,req.body)
    await db.collection('Message').doc('ALL').update(
        {
            activity_id:req.body.activity_id,
            can_join: req.body.can_join,
            prize: req.body.prize,
            processing_number: req.body.processing_number,
        }
    )
    const resCountOHS = await db.collection('ProcessingStaff').where({
        company: 'OHS',
        processing_number: req.body.processing_number,
    }).count()
    await db.collection('Message').doc('OHS').update(
        {
            processing_count: resCountOHS.total,
        }
    )
    const resCountJHG = await db.collection('ProcessingStaff').where({
        company: 'JHG',
        processing_number: req.body.processing_number,
    }).count()
    await db.collection('Message').doc('JHG').update(
        {
            processing_count: resCountJHG.total,
        }
    )
    res.send({success:true})
})

app.post('/processing_staff/',async (req, res) => {
    console.log(`processing_staff`,req.body)
    let staff_id = Number(req.body.staff_id)
    if(isNaN(staff_id)) {
        res.send({success:false})
        return
    }
    let staff = null
    await db.collection('Staff').where(
        {
            company: req.body.company,
            _id: staff_id,
        }
    ).get().then(result=>{
        if(result.data.length>0){
            staff = result.data[0]
        }
    })
    if(staff!=null){
        if(staff.times<=0){
            res.send({success:false,message:'剩余抽奖次数不足。'})
            return
        }

        let result = await db.collection('ProcessingStaff').where({
            company: staff.company,
            staff_id:staff._id,
            processing_number: req.body.processing_number,
        }).count()

        if(result.total>0){
            res.send({success:false,message:'不能重复添加。'})
            return
        }

        await db.collection('Staff').where(
            {
                company: req.body.company,
                _id: staff_id,
            }
        ).update({times:_.inc(-1)})

        await db.collection('ProcessingStaff').add({
            avatar:staff.avatar,
            company: staff.company,
            staff_id:staff._id,
            name: staff.name,
            processing_number: req.body.processing_number,
            shooting: false,
            winning:false
        })

        await db.collection('Message').doc(req.body.company).update(
            {processing_count: _.inc(1)}
        )

        res.send({success:true})
        return
    }

    res.send({success:false})
})

app.post('/delete_processing_staff/',async (req, res) => {
    console.log(`delete_processing_staff`,req.body)

    for(var i=0;i<req.body.staffs.length;i++)
    {
        let staff_id = Number(req.body.staffs[i])
        let staff = null
        await db.collection('Staff').where(
            {
                company: req.body.company,
                _id: staff_id,
            }
        ).get().then(result=>{
            if(result.data.length>0){
                staff = result.data[0]
            }
        })
        if(staff!=null){
            await db.collection('Staff').where(
                {
                    company: req.body.company,
                    _id: staff_id,
                }
            ).update({times:_.inc(1)})

            await db.collection('ProcessingStaff').where({
                company: staff.company,
                staff_id:staff._id,
                processing_number: req.body.processing_number,
            }).remove()

            await db.collection('Message').doc(req.body.company).update(
                {processing_count: _.inc(-1)}
            )
        }
    }

    res.send({success:true})
})

app.post('/winning_staff/',async (req,res)=>{
    console.log(`winning_staff`,req.body)

    for(var i=0;i<req.body.staffs.length;i++)
    {
        let staff_id = Number(req.body.staffs[i])
        let staff = null
        await db.collection('Staff').where(
            {
                company: req.body.company,
                _id: staff_id,
            }
        ).get().then(result=>{
            if(result.data.length>0){
                staff = result.data[0]
            }
        })
        if(staff!=null){
            let result = await db.collection('Message').doc('ALL').get()
            let prize = result.data[0].prize

            await db.collection('Staff').where(
                {
                    company: req.body.company,
                    _id: staff_id,
                }
            ).update(
                {
                    prize_id: req.body.processing_number,
                    prize_name: prize,
                    times: 0,
                    winning: true,
                })

            await db.collection('ProcessingStaff').where({
                company: staff.company,
                staff_id:staff._id,
                processing_number: req.body.processing_number,
            }).update(
                {
                    winning: true,
                })
        }
    }

    res.send({success:true})
})

app.post('/lottery/', async(req, res) => {
    console.log(`lottery`,req.body)
    let processing_number = 0
    await db.collection('Message').doc('ALL').get().then(result=>
        {
            processing_number = result.data[0].processing_number
        }
    )

    // 一等奖、特等奖不带部长和新员工
    if(processing_number > 12){
        let staffs = await db.collection('Staff').where({
            _id:_.in(req.body.lottery_staffs)

        }).get()

        for(let i=0;i<staffs.data.length;i++){
            await db.collection('ProcessingStaff').add({
                _id:staffs.data[i].company + '_' + processing_number + '_' + staffs.data[i]._id,
                avatar: staffs.data[i].avatar,
                company: staffs.data[i].company,
                staff_id: staffs.data[i]._id,
                name: staffs.data[i].name,
                processing_number:processing_number,
                shooting:true,
                winning:false,
            })
        }
    }else{
        let staffs = await db.collection('Staff').where({
            _id:_.in(req.body.lottery_staffs)
        }).get()

        for(let i=0;i<staffs.data.length;i++){
            await db.collection('ProcessingStaff').add({
                _id:staffs.data[i].company + '_' + processing_number + '_' + staffs.data[i]._id,
                avatar: staffs.data[i].avatar,
                company: staffs.data[i].company,
                staff_id: staffs.data[i]._id,
                name: staffs.data[i].name,
                processing_number:processing_number,
                shooting:true,
                winning:false,
            })
        }
    }

    //============================================

    ////二等奖以后不需要报名就可以参加
    //if(processing_number>12){
    //    let staffs = await db.collection('Staff').where({
    //        _id:_.in(req.body.lottery_staffs)
    //    }).get()
    //    for(let i=0;i<staffs.data.length;i++){
    //        await db.collection('ProcessingStaff').add({
    //            _id:staffs.data[i].company + '_' + processing_number + '_' + staffs.data[i]._id,
    //            avatar: staffs.data[i].avatar,
    //            company: staffs.data[i].company,
    //            staff_id: staffs.data[i]._id,
    //            name: staffs.data[i].name,
    //            processing_number:processing_number,
    //            shooting:true,
    //            winning:false,
    //        })
    //    }
    //}
    //else{
    //    await db.collection('ProcessingStaff').where(
    //        {
    //            staff_id: _.in(req.body.lottery_staffs),
    //            processing_number: processing_number,
    //        }
    //    ).update(
    //        {
    //            shooting:true
    //        }
    //    )
    //}

    //===============================

    res.send({success:true})

})

//HTML画面
app.get('/', (req, res) => {
    res.render('index')
})

app.get('/config/index/', (req, res) => {
    res.render('index')
})

app.get('/config/backup/', (req, res) => {
    res.render('backup')
})

app.get('/config/lottery/', (req, res) => {
    res.render('lottery')
})

app.get('/config/lottery_ohs/', (req, res) => {
    res.render('lottery_ohs')
})

app.get('/config/lottery_jhg/', (req, res) => {
    res.render('lottery_jhg')
})

app.get('/config/lottery_viewer/', (req, res) => {
    res.render('lottery_viewer')
})

app.get('/config/processing_staff/', (req, res) => {
    res.render('processing_staff')
})

app.get('/config/staffs/', (req, res) => {
    res.render('staffs')
})

app.get('/config/system/', (req, res) => {
    res.render('system')
})

app.get('*',function(req,res){
    res.send("<h1>404此页面已丢失<h1/>")
})

app.use("/",router)

const port = process.env.PORT || 80;
http.listen(port, () => {
    console.log('Manager listening on port', port)
})
