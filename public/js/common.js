function makeUrl(api, ws) {
    let scheme = window.location.protocol;
    let url = scheme + '//' + window.location.host + '/' + api;
    if(ws == 'ws' && scheme == 'https:'){
        url = 'wss' + '://' + window.location.host + '/' + api;
    }else if(ws == 'ws'){
        url = 'ws' + '://' + window.location.host + '/' + api;
    }
    return url;
}

function postJSON(url, data){
    return $.ajax({url:makeUrl(url),data:JSON.stringify(data),type:'POST', contentType:'application/json'});
}

function postFile(url, data){
    return $.ajax({url:makeUrl(url),data:data,type:'POST', processData:false, contentType:false});
}

function getJSON(url, data){
    return $.ajax({url:makeUrl(url),data,type:'GET', contentType:'application/json'});
}

function connectWS() {
    window.wsOpen = false;
    if ("WebSocket" in window){
        // 打开一个 web socket
        window.ws = new WebSocket(makeUrl('activity_live/', 'ws'));
        ws.onopen = function(){
            window.wsOpen = true;
            sendMessage();
        };
        ws.onmessage = function (evt){
            var received_msg = evt.data;
        };
        ws.onclose = function(){
            // 关闭 websocket
            window.wsOpen = false;
        };
    }else{
        // 浏览器不支持 WebSocket
        alert("您的浏览器不支持 WebSocket!");
    }
}

function sendMessage() {
    if(window.wsOpen != undefined && window.wsOpen == true && window.socketMsgQueue != undefined){
        $(window.socketMsgQueue).each(function(){
            window.ws.send(JSON.stringify($(this)[0]));
        });
    }
}

function makePostData(obj) {
    let data = {}
    $("input[type=text], select", obj).each(function(){
        data[$(this).attr('name')] = $(this).val();
    });
    $("input[type=checkbox]", obj).each(function(){
        data[$(this).attr('name')] = $(this).is(':checked')?true:false;
    });
    return data;
}

function scrollBar(obj) {
    obj.scrollTop(10);
    return $("body").scrollTop()>0;
    obj.scrollTop(0);
}

function timing(timestamp) {
    console.log($.now()-timestamp_ + ' ms');
    timestamp = $.now();
}

Date.prototype.Format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        "S": this.getMilliseconds()
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};

function MyMessagebox(){	
	
    var reg = new RegExp("\\[([^\\[\\]]*?)\\]", 'igm');
    
    var messageObject;  
    var messageObjectHtml;
    
    var _init = function(){
        messageObject = $("#my-messagebox");
        messageObjectHtml = messageObject.html();
    }
  
    var _alert = function (options) {  
      messageObject.html(messageObjectHtml); 
      messageObject.find('.ok').removeClass('btn-success').addClass('btn-primary');  
      messageObject.find('.cancel').hide();  
      _dialog(options);  
  
      return {  
        on: function (callback) {  
          if (callback && callback instanceof Function) {  
            messageObject.find('.ok').click(function () { callback(true) });  
          }  
        }  
      };  
    };  
  
    var _confirm = function (options) {  
      messageObject.html(messageObjectHtml); 
      messageObject.find('.ok').removeClass('btn-primary').addClass('btn-success');  
      messageObject.find('.cancel').show();  
      _dialog(options);  
  
      return {  
        on: function (callback) {  
          if (callback && callback instanceof Function) {  
            messageObject.find('.ok').click(function () { callback(true) });  
            messageObject.find('.cancel').click(function () { return; });  
          }  
        }  
      };  
    };  
  
    var _dialog = function (options) {  
      var ops = {  
        msg: "",  
        btnok: "OK",  
        btncl: "Cancel"  
      };  
  
      $.extend(ops, options);  
  
      var html = messageObject.html().replace(reg, function (node, key) {  
        return {
          Message: ops.msg,  
          BtnOk: ops.btnok,  
          BtnCancel: ops.btncl  
        }[key];  
      });  
        
      messageObject.html(html);  
      messageObject.modal({  
        width: 300,  
        backdrop: 'static'  
      });  
    }

    var _showAlert = function(msg, callback){  
        _alert({
            msg: msg,  
            btnok: 'OK'  
        }).on(function (e) {
            if(callback){  
                callback();  
            }  
         });  
    }  
    
    var _showConfirm= function(msg,callback){   
        _confirm(  
          {
              msg: msg,  
          }).on( function (e) {  
              callback(); 
          });   
    }

    return {
      init:_init,
      alert: _showAlert,  
      confirm: _showConfirm  
    }
}

messageBox = new MyMessagebox();
messageBox.init();