'use strict'

const Promise = require('bluebird')
var bplist = require('bplist')
var fs = require('fs')
var unzip = require('unzip2')
var os = require('os')
var util = require('util')
var execSync = require('child_process').execSync;
var EventEmitter = require('eventemitter3')

function IpaReader(filepath) {
  EventEmitter.call(this)
  this.file = filepath
  this.cachedir = os.tmpdir()+'/ipa'
}

util.inherits(IpaReader, EventEmitter)

IpaReader.prototype.parsePlist = function(){
  var manifest = {}
    var destdir = this.cachedir+'/Payload'
    var dirs = fs.readdirSync(destdir)
    destdir = util.format("%s/%s",destdir,dirs[0])
    var destfile = destdir+'/Info.plist'
    var content = fs.readFileSync(destfile)
    return new Promise((resolve,reject)=>{
      bplist.parseBuffer(content,function(err,result){
        if(err){
          return reject(err)
        }
        manifest = result[0]
        manifest.package = result[0].CFBundleIdentifier
        manifest.versionCode = parseInt(result[0].CFBundleInfoDictionaryVersion)
        manifest.versionName = result[0].CFBundleShortVersionString
        return resolve(manifest) 
      })
    })
}

IpaReader.prototype.UnzipIpa = function(){
    this.cachedir = os.tmpdir()+'/ipa'
    if(fs.existsSync(this.cachedir)){
    var cmd = 'rm -rf '+this.cachedir
      console.log(cmd)
      execSync(cmd,{});
    }
    fs.mkdirSync(this.cachedir)
   
    return new Promise((resolve,reject)=>{
      fs.createReadStream(this.file )
      .pipe(unzip.Extract({path:this.cachedir})).on('close',()=>{
        return resolve()
      })
    })
}

IpaReader.prototype.ReadInfoPlist = function(){
  return new Promise((resolve,reject)=>{
    this.UnzipIpa().then(()=>{
      this.parsePlist().then(function(res){
        return resolve(res)
      })
    })
  })
}

module.exports = IpaReader
      