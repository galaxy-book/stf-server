var requestPromise = require('request-promise')
var syrup = require('stf-syrup')
var request = require('request')
var Promise = require('bluebird')
var url = require('url')
var util = require('util')
var logger = require('../../../util/logger')
var EventEmitter = require('eventemitter3')
var lifecycle = require('../../../util/lifecycle')

module.exports = syrup.serial()
.define(function(options){
    var log = logger.createLogger('ios-device:plugins:wdaCommands')
    var plugin = new EventEmitter()
    var baseUrl = util.format('http://localhost:%d',options.wdaPort)
    var sessionid = null
    var sessionTimer = null
    
    plugin.getSessionid = function(){
        if(sessionid==null){
            plugin.initSession()
        }
        return sessionid
    }

    plugin.initSession = function(){
        let options = {
            method:'GET',
            uri:baseUrl+'/status',
            headers:{
                'Content-Type':'application/json'
            },
            json:true
        }
        requestPromise(options).then(function(resp){
            sessionid = resp.sessionId
            return sessionid
        }).catch(function(err){
            plugin.emit('restart')
            return null
        })
    }

    plugin.click = function(x,y,duration){
        var body = {
            x:x,
            y:y,
            duration:duration
        }
        plugin.PostData('wda/click_control',body,false)
    }

    plugin.swipe = function(startX,startY,endX,endY,duration){
        var body = {
            actions:[
                {
                    action:"press",
                    options:{
                        x:startX,
                        y:startY
                    }
                },
                {
                    action:"wait",
                    options:{
                        ms:duration
                    }
                },
                {
                    action:"moveTo",
                    options:{
                        x:endX,
                        y:endY
                    }
                },
                {
                    action:"release",
                    options:{}
                }
            ]
        }
        plugin.PostData('wda/touch/perform',body,false)
    }

    plugin.launchApp = function(bundleId){
        var body = {
            desiredCapabilities:{
                bundleId:bundleId
            }
        }
        plugin.PostData('session',body,false)
    }

    function processResp(resp){
        var respValue = resp.value
        if(respValue=={}||respValue==null||respValue=="")
            return
        if(respValue.func==undefined)
            return
        return plugin.emit(respValue.func,respValue)
    }

    plugin.PostData = function(uri,body,bWithSession){
        var session = ''
        if(bWithSession)
            session = util.format("/session/%s",plugin.getSessionid())
        let options = {
            method:'POST',
            uri:util.format("%s%s/%s",baseUrl,session,uri),
            body:body,
            json:true,
            headers:{
                'Content-Type':'application/json'
            }
        }
        requestPromise(options).then(function(resp){
            processResp(resp)
        }).catch(function(err){
            log.info('post request err',err)
            plugin.emit('restart')
            return null
        })
    }

    plugin.GetRequest = function(uri,param='',bWithSession=false){
        var session = ''
        if(bWithSession)
            session = util.format("/session/%s",plugin.getSessionid())
        let options = {
            method:'GET',
            uri:util.format("%s%s/%s%s",baseUrl,session,uri,param),
            json:true,
            headers:{
                'Content-Type':'application/json'
            }
        }
        requestPromise(options).then(function(resp){
            processResp(resp)
        }).catch(function(err){
            log.info('get request err',err)
            plugin.emit('restart')
            return null
        })
    }

    sessionTimer = setInterval(plugin.initSession, 30000);

    lifecycle.observe(function() {
        clearInterval(sessionTimer)
        return true
    })

    return plugin
})
