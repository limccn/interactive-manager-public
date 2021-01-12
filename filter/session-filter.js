function SessionFilter(){

}
SessionFilter.prototype.doFilter=function(req,res,next){
    if(req.session.user||req.originalUrl=="/config/lottery_viewer/"){
        next()
    }else{
        res.render("login")
    }
}
module.exports=SessionFilter