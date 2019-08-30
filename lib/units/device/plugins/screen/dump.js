var util = require('util')
var _ = require('lodash')
var adbkit = require('adbkit')

var syrup = require('stf-syrup')
var xml2map = require('xml2map')
var fs = require('fs')
var path = require('path')
var logger = require('../../../../util/logger')
var wire = require('../../../../wire')
var wireutil = require('../../../../wire/util')
var Promise = require('bluebird')

module.exports = syrup.serial()
  .dependency(require('../../support/adb'))
  .dependency(require('../../support/router'))
  .dependency(require('../../support/push'))
  .dependency(require('../../support/storage'))
  .define(function(options, adb, router, push, storage) {
    var log = logger.createLogger('device:plugins:screen:dump')
    var plugin = Object.create(null)

    const adaptor = function(node) {
      if(node.bounds) {
        const bounds = node.bounds.match(/[\d\.]+/g)

        node.bounds = [
          ~~bounds[0],
          ~~bounds[1],
          bounds[2] - bounds[0],
          bounds[3] - bounds[1]
        ]
      }

      if (node.node) {
        node.nodes = node.node.length ? node.node : [node.node]
        node.nodes.forEach(adaptor)
        delete node.node
      }
      return node
    }

    plugin.dump = function() {
      var tempDir = path.join(__dirname, '../../../../../', 'tmp')
      log.info('Screen Dump')
      var file = util.format('/data/local/tmp/%s_%d.xml', options.serial,Date.now())
      log.info('xml file name: ' + file)
      var name = options.serial + '.xml'
      var fn = path.join(tempDir, name)
      var f2jsonName = options.serial + '.json'
      var f2json = path.join(tempDir, f2jsonName)
      var commd = 'uiautomator dump ' + file
      return adb.shell(options.serial, commd)
        .then(adbkit.util.readAll)
        .then(function() {
          return adb.pull(options.serial, file)
            .then(function(transfer) {
              return new Promise(function(resolve, reject) {
                transfer.on('end', function() {
                  var xml = fs.readFileSync(fn, 'utf-8')
                  if(xml) {
                    log.info('xml file is not empty')
                    xml = xml.replace(/content-desc=\"\"/g, 'content-desc="null"')
                    var origin_data = xml2map.tojson(xml)
                    var hierarchy = origin_data.hierarchy
                    if(hierarchy.node) {
                      var data = adaptor(hierarchy.node)
                      fs.writeFileSync(f2json, JSON.stringify(data))
                      var readerStream = fs.createReadStream(f2json)
                      resolve(readerStream)
                    }
                  }
                })
                transfer.pipe(fs.createWriteStream(fn))
              })
            })
            .then(function(stream) {
              return storage.store('blob', stream, {
                filename: util.format('%s.json', options.serial)
                , contentType: 'text/plain'
              })
            })
            .finally(function() {
              log.info('remove xml file')
              return adb.shell(options.serial, ['rm', '-f', file])
                .then(adbkit.util.readAll)
            })
        })
    }

    router.on(wire.ScreenDumpMessage, function(channel) {
      plugin.dump()
        .then(function(file) {
          var reply = wireutil.reply(options.serial)
          push.send([
            channel
            , reply.okay('success', file)
          ])
        })
    })

    return plugin
  })
