'use strict';

var fs = require('fs'),
    path = require('path'),
    Bluebird = require('bluebird'),
    tmp = require('tmp'),
    ImageMagick = require('./imagemagick');

var createTemporaryFile = function(directory, prefix, format) {
  var deferred = Bluebird.defer();

  var options = {
    dir: directory,
    prefix: prefix + '.',
    postfix: '.' + format,
    keep: true
  };

  tmp.file(options, function(err, filepath) {
    if (err) return deferred.reject(err);
    deferred.resolve(filepath);
  });

  return deferred.promise;
};

var createTargetImage = function(src, dest, options) {
  return ImageMagick
    .convert(src, dest, options);
};

var createThumbnailImage = function(src, dest, options) {
  return ImageMagick
    .convert(src, dest, options);
};

var deleteFilesWithIgnoringError = function(files) {
  return Bluebird.map(files, function(file) {
    var deferred = Bluebird.defer();
    fs.unlink(file, function() {
      deferred.resolve();
    });
    return deferred.promise;
  });
};

var createCleaner = function(originalPath, targetPath, withThumbnail, thumbnailPath) {
  var files = [targetPath];
  if (withThumbnail) files.push(thumbnailPath);

  return {
    files : files,
    cleaned : false,
    clean: function(includeOriginal) {
      if (this.cleaned) return;
      this.cleaned = true;
      if (includeOriginal) this.files.push(originalPath);
      return deleteFilesWithIgnoringError(this.files);
    }
  };
};

var loadImage = function(original, options) {
  options = options || {};
  var quality = options.quality || 75;
  var maxWidth = options.maxWidth || 3000;
  var maxHeight = options.maxHeight || 3000;
  var withThumbnail = options.withThumbnail || false;
  var thumbnailResolution = options.thumbnailResolution || 128;
  var thumbnailQuality = options.thumbnailQuality || quality;

  return ImageMagick.identify(original)
    .then(function(info) {
      var workingDirectory = options.workingDirectory || path.dirname(original);
      var format = options.format ?options.format.toLowerCase() : info.format.toLowerCase();
      var thumbnailFormat = options.thumbnailFormat ? options.thumbnailFormat.toLowerCase() : info.format.toLowerCase();

      return Bluebird.all([
        info,
        createTemporaryFile(workingDirectory, 'target', format),
        createTemporaryFile(workingDirectory, 'thumbnail', thumbnailFormat)
      ]);
    })
    .spread(function(info, targetPath, thumbnailPath) {
      var all = [
        createTargetImage(original, targetPath, {
          quality: quality,
          maxWidth: maxWidth,
          maxHeight: maxHeight
        })
      ];

      if (withThumbnail) {
        var width = info.width;
        var height = info.height;
        var cropSize = Math.min(width, height);
        var cropX = cropSize < width ? (width - cropSize) / 2 : 0;
        var cropY = cropSize < height ? (height - cropSize) / 2 : 0;

        all.push(
          createThumbnailImage(original, thumbnailPath, {
            quality: thumbnailQuality,
            cropWidth: cropSize,
            cropHeight: cropSize,
            cropX: cropX,
            cropY: cropY,
            maxWidth: thumbnailResolution,
            maxHeight: thumbnailResolution
          })
        );
      }

      return Bluebird.all(all);
    })
    .spread(function(targetInfo, thumbnailInfo) {
      var result = {
        target: {
          info: targetInfo,
          stream: fs.createReadStream(targetInfo.filepath)
        },
        cleaner: createCleaner(original, targetInfo.filepath, withThumbnail, thumbnailInfo.filepath)
      };

      if (withThumbnail) {
        result.thumbnail = {
          info: thumbnailInfo,
          stream: fs.createReadStream(thumbnailInfo.filepath)
        };
      }

      return result;
    });
};

exports.load = loadImage;
