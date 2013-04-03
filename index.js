#!/usr/bin/env node

'use strict'

var fs = require('fs')
var path = require('path')
var spawn = require('child_process').spawn

require('mkee')(AutoConvert)

module.exports = AutoConvert

function AutoConvert(config){
  if(!(this instanceof AutoConvert))
    return new AutoConvert(config)

  var _this = this
  var src = config.src || '.'
  var dest = config.dest || '.'

  var ext = config.ext

  if(config.watch){
    fs.watch(src, check)
  }

  check()

  function check(){
    var seen = {}
    var files = []

    checkdir(src)

    function checkdir(dir){
      fs.readdir(dir, function(err, filenames){
        var readmore = files.length == 0
        if(err) _this.emit('error', err)
        else {
          filenames.forEach(function(fn){
            files.push(path.join(dir, fn))
          })
        }
        if(readmore)
          nextFile()
      })
    }

    function nextFile(){
      if(files.length){
        var fn = files.pop()
        fs.realpath(fn, function(err, path){
          if(err) return _this.emit('error', err), nextFile()
          checkFile(path)
        })
      }
    }

    function checkFile(filename){
      if(!seen[filename]){
        seen[filename] = true
        fs.stat(filename, function(err, stat){
          if(err) return _this.emit('error', err), nextFile()
          if(stat.isDirectory()){
            checkdir(filename)
            nextFile()
          } else {
            var extname = path.extname(filename)
            var cmd = ext[extname]

            if(cmd){
              if(!cmd.dext && !cmd.destname) return _this.emit('error', new Error('dext or destname parameter is required for extension ' + extname)), nextError()

              if(cmd.destname){
                var destname = cmd.destname
              } else {
                var basename = path.basename(filename)
                var destname = basename.replace(new RegExp(extname + '$'), cmd.dext)
              }

              var dirname = path.dirname(filename)
              var relative = path.relative(src, dirname)
              var destdir = path.join(dest, relative)
              var destfile = path.join(destdir, destname)

              //check if dest exists & is older
              fs.stat(destfile, function(err, dstat){
                if(err && err.code != 'ENOENT'){
                  _this.emit('error', err)
                  nextFile()
                } else {
                  if(dstat && dstat.mtime >= stat.mtime){
                    nextFile()
                  } else {
                    //convert using the specified commands
                    var args = cmd.args.map(function(arg){
                      return arg.replace(/\$\{(src|dest|srcdir|destdir)\}/g, function(r, m){
                        return m == 'src' ? filename : 
                          m == 'dest' ? destfile :
                          m == 'srcdir' ? dirname :
                          m == 'destdir' ? destdir : _this.emit('error', new Error('arg variable name not recognized: ' + m))
                      })
                    })

                    var cp = spawn(cmd.bin, args)
                    cp.on('exit', function(c){
                      if(c != 0) _this.emit('error', new Error('StatusCode ' + c + ' returned for file ' + filename))
                      nextFile()
                    })

                    cp.stderr.pipe(process.stderr)

                    if(cmd.pipeIn)
                      fs.createReadStream(filename).pipe(cp.stdin)
                    if(cmd.pipeOut)
                      cp.stdout.pipe(fs.createWriteStream(destfile))
                  }
                }
              })
            } else {
              nextFile()
            }
          }
        })
      }
    }
  }
}

if(require.main == module){
  var cfgfile = process.argv[2] || 'config.json'
  var config = require(path.resolve(cfgfile))

  var ac = new AutoConvert(config)
  ac.on('error', function(e){console.error('Error: ' + e.message)})
}
