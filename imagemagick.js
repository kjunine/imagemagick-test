'use strict';

var _ = require('lodash'),
    Bluebird = require('bluebird'),
    exec = require('child_process').exec,
    mime = require('mime');

function _endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function endsWith(str, suffix) {
  if (suffix instanceof Array) {
    return _.some(suffix, function(suffix) {
      return _endsWith(str, suffix);
    });
  }

  return _endsWith(str, suffix);
}

var identify = exports.identify = function(filepath) {
  var deferred = Bluebird.defer();

  // NOTE identity is from imagemagick
  // %m: format, %w: width, %h: height, %b: filesize in byte, %z: depth, %x: density
  var command = 'identify -format "%m %w %h %b %z %x x %y\\n" "' + filepath + '"';

  exec(command, function(err, result) {
    if (err) return deferred.reject(err);

    var lines = result.trim().split('\n');

    var infos = _.map(lines, function(line) {
      var tokens = line.split(' ');
      if (tokens.length > 6) {
        var last = tokens.splice(5);
        _.remove(last, function(token) {
          return _.contains(['Undefined', 'PixelsPerInch', 'PixelsPerCentimeter'], token);
        });
        tokens.push(last.join(''));
      }

      return {
        format: tokens[0],
        width: parseInt(tokens[1]),
        height: parseInt(tokens[2]),
        filesize: parseInt(tokens[3]),
        depth: parseInt(tokens[4]),
        density: tokens[5]
      };
    });

    var info = infos[infos.length - 1];

    info = {
      filepath: filepath,
      filesize: info.filesize,
      format: info.format,
      width: _.max(infos, 'width').width,
      height: _.max(infos, 'height').height,
      depth: info.depth,
      density: info.density,
      mimetype: mime.lookup(info.format)
    };

    deferred.resolve(info);
  });

  return deferred.promise;
};

exports.convert = function(src, dest) {
  var deferred = Bluebird.defer();

  var args = ['convert'];

  var flatten = endsWith(src, '.gif') && !endsWith(dest, '.gif');
  var opaque = endsWith(src, ['.png', '.gif']) && !endsWith(dest, ['.png', '.gif']);

  args.push(flatten ? src + '[0]' : src);

  if (flatten || opaque) args.push('-flatten');

  args.push(dest);

  var command = args.join(' ');

  console.log('command:', command);

  exec(command, function(err) {
    if (err) return deferred.reject(err);

    deferred.resolve(identify(dest));
  });

  return deferred.promise;
};
