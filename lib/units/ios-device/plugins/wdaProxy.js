
var syrup = require('stf-syrup')
var execSync = require("child_process").execSync
var SubpPocess = require("teen_process").SubProcess
var util = require("util")
var EventEmitter = require('events').EventEmitter;
var Promise = require('bluebird');
var lifecycle = require('../../../util/lifecycle')
var path = require('path')

var logger = require('../../../util/logger')

module.exports = syrup.serial()
.dependency(require('./wdaCommands'))
.define(function(options,wda){
  var log = logger.createLogger('ios-device:plugins:wdaProxy')
  var plugin = new EventEmitter()
  var wdaPro = null;
  var proxyProMap = new Map()
  var exit = false
  var bRestart = true
  var wdaPath = options.wdaPath

  wda.on('restart',function(){
    if(!bRestart)
      return 
    plugin.restartWda()
  })

  plugin.start = async function(){
    if(options.type=='device'){
      proxyProMap.set(options.wdaPort,plugin.startIproxy(options.wdaPort,options.wdaRemotePort))
      proxyProMap.set(options.mjpegPort,plugin.startIproxy(options.mjpegPort,options.wdaMjpegRemotePort))
    }
    return plugin.startWda().then(function(){
      return plugin
    })
  }

  plugin.restartIproxy = function(localPort,remotePort){
    if (!exit)
        proxyPro = null;
        proxyProMap.set(localPort,plugin.startIproxy(localPort,remotePort));
  };

  plugin.startIproxy = function(localPort,remotePort){
    log.info("start iproxy with params:%d %d %s",localPort,remotePort,options.serial)
    pro = new SubpPocess("iproxy",[localPort,remotePort,options.serial])
    pro.start();
    pro.on("exit",(code,signal)=>{
      log.info("exit with code :%d",code)
      plugin.restartIproxy(localPort,remotePort);
    });
    pro.on("output",(stdout,stderr)=>{
    });
    return pro
  };

  plugin.restartWda = function(){
    if (wdaPro!=null&& bRestart)
      wdaPro.stop()
    if (!exit && bRestart)
        plugin.startWda();
  };

  plugin.startWda = function(){
    var platform = ""
    if(options.type=='emulator'){
      platform = " Simulator"
    }
    var params = ['build-for-testing', 'test-without-building','-project',path.join(wdaPath,'WebDriverAgent.xcodeproj')
                  ,'-scheme','WebDriverAgentRunner','-destination','id='+options.serial+',platform=iOS'+platform
                  ,'-configuration','Debug','IPHONEOS_DEPLOYMENT_TARGET=10.2']
    log.info("start WDA with params:%s",params);
    const env = { 
      USE_PORT: options.wdaRemotePort,
      MJPEG_SERVER_PORT:options.wdaMjpegRemotePort
    }
    wdaPro = new SubpPocess("xcodebuild",params, {
      cwd: options.wdaPath,
      env,
      detached: true
    })
    wdaPro.start()
    wdaPro.on("exit",(code,signal)=>{
      wdaPro = null;
      bRestart = true
      plugin.restartWda();
    });
    return new Promise((resolve,reject)=>{
      wdaPro.on("stream-line",line=>{
        bRestart = false
        if (line.indexOf('=========')!=-1)
          log.info(line)
        if(line.indexOf("** TEST BUILD SUCCEEDED **")!=-1)
          log.info("xcodebuild构建成功")
        else if (line.indexOf("ServerURLHere->")!=-1){
          log.info("WDA启动成功")
          wda.launchApp('com.apple.Preferences')
          wda.initSession()
          plugin.emit("started");
          bRestart=true
          return resolve()
        }
      })
    })
  };
  plugin.end = function() {
    exit = true
    if (wdaPro!=null)
      wdaPro.stop()
    var proIter = proxyProMap.values()
    while((pro=proIter.next().value)!=null){
      pro.stop()
    }
    return true
  };

  lifecycle.observe(function() {
    return plugin.end()
  })

  return plugin.start()
})
