'use strict';

var _ = require('lodash'),
    Bluebird = require('bluebird'),
    exec = require('child_process').exec,
    util = require('util'),
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

var handleDensity = function(tokens, densityIndex) {
  if (tokens.length >= densityIndex) {
    var last = tokens.splice(densityIndex);
    _.remove(last, function(token) {
      return 'Undefined' === token;
    });
    last = _.map(last, function(token) {
      if ('PixelsPerInch' === token) return 'ppi';
      if ('PixelsPerCentimeter' === token) return 'ppcm';
      if ('x' === token) return ' x ';
      return token;
    });
    tokens.push(last.join(''));
  }
  return tokens;
};

var identify = exports.identify = function(filepath) {
  var deferred = Bluebird.defer();

  // NOTE identity is from imagemagick
  // %m: format, %w: width, %h: height, %b: filesize in byte, %z: depth,
  // %Q: quality, %x: x resolution, %y: y resolution
  var command = 'identify -format "%m %w %h %b %z %Q %x x %y\\n" "' + filepath + '"';

  exec(command, function(err, result) {
    if (err) return deferred.reject(err);

    var lines = result.trim().split('\n');

    var infos = _.map(lines, function(line) {
      var tokens = line.split(' ');
      handleDensity(tokens, 6);

      return {
        format: tokens[0],
        width: parseInt(tokens[1]),
        height: parseInt(tokens[2]),
        filesize: parseInt(tokens[3]),
        depth: parseInt(tokens[4]),
        quality: parseInt(tokens[5]),
        density: tokens[6]
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
      quality: info.quality,
      density: info.density,
      scenes: lines.length,
      mimetype: mime.lookup(info.format)
    };

    deferred.resolve(info);
  });

  return deferred.promise;
};

exports.convert = function(src, dest, options) {
  var quality = options.quality || 75;
  var density = options.density || 72;
  var cropWidth = options.cropWidth;
  var cropHeight = options.cropHeight || cropWidth;
  var cropX = options.cropX || 0;
  var cropY = options.cropY || 0;
  var maxArea = options.maxArea;
  var fixedWidth = options.fixedWidth;
  var fixedHeight = options.fixedHeight || fixedWidth;
  var maxWidth = options.maxWidth || 3000;
  var maxHeight = options.maxHeight || maxWidth;

  var deferred = Bluebird.defer();

  var flatten = endsWith(src, '.gif') && !endsWith(dest, '.gif');
  var opaque = endsWith(src, ['.png', '.gif']) && !endsWith(dest, ['.png', '.gif']);
  var animated = endsWith(src, '.gif') && endsWith(dest, '.gif');

  var args = ['convert'];

  args.push(flatten ? src + '[0]' : src);

  args.push('-quality', quality);
  args.push('-density', density);
  args.push('-units', 'PixelsPerInch');

  if (flatten || opaque) args.push('-flatten');

  if (cropWidth) {
    if (animated) args.push('-coalesce', '-repage', '0x0');
    args.push('-crop',
      util.format('"%dx%d+%d+%d"', cropWidth, cropHeight, cropX, cropY));
    if (animated) args.push('+repage');
  }

  if (maxArea) {
    args.push('-resize', util.format('"%d@"', maxArea));
  } else if (fixedWidth) {
    args.push('-resize', util.format('"%dx%d!"', fixedWidth, fixedHeight));
  } else {
    args.push('-resize', util.format('"%dx%d>"', maxWidth, maxHeight));
  }

  args.push(dest);

  var command = args.join(' ');

  exec(command, function(err) {
    if (err) return deferred.reject(err);

    deferred.resolve(identify(dest));
  });

  return deferred.promise;
};
