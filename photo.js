'use strict';

var fs = require('fs'),
    path = require('path'),
    Bluebird = require('bluebird'),
    tmp = require('tmp'),
    ImageMagick = require('./imagemagick');

var createTemporaryFile = function(directory, format) {
  var deferred = Bluebird.defer();

  var options = {
    dir: directory,
    postfix: '.' + format,
    keep: true
  };

  tmp.file(options, function(err, filepath) {
    if (err) return deferred.reject(err);
    deferred.resolve(filepath);
  });

  return deferred.promise;
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
  var density = options.density || 72;
  var maxArea = options.maxArea || 1000000;
  var withThumbnail = options.withThumbnail || false;
  var thumbnailResolution = options.thumbnailResolution || 128;
  var thumbnailQuality = options.thumbnailQuality || quality;
  var thumbnailDensity = options.thumbnailDensity || density;

  return ImageMagick.identify(original)
    .then(function(info) {
      var workingDirectory = options.workingDirectory || path.dirname(original);
      var format = options.format ?options.format.toLowerCase() : info.format.toLowerCase();
      var thumbnailFormat = options.thumbnailFormat ? options.thumbnailFormat.toLowerCase() : info.format.toLowerCase();

      quality = info.quality ? Math.min(info.quality, quality) : quality;
      maxArea = info.width * info.height < maxArea ? info.width * info.height : maxArea;

      var all = [
        info,
        createTemporaryFile(workingDirectory, format)
      ];

      if (withThumbnail) {
        all.push(createTemporaryFile(workingDirectory, thumbnailFormat));
      }

      return all;
    })
    .spread(function(info, targetPath, thumbnailPath) {
      var all = [
        ImageMagick.convert(original, targetPath, {
          quality: quality,
          density: density,
          maxArea: maxArea
        })
      ];

      if (withThumbnail) {
        var cropSize = Math.min(info.width, info.height);
        var cropX = cropSize < info.width ? (info.width - cropSize) / 2 : 0;
        var cropY = cropSize < info.height ? (info.height - cropSize) / 2 : 0;

        all.push(
          ImageMagick.convert(original, thumbnailPath, {
            quality: thumbnailQuality,
            density: thumbnailDensity,
            cropWidth: cropSize,
            cropHeight: cropSize,
            cropX: cropX,
            cropY: cropY,
            fixedWidth: thumbnailResolution,
            fixedHeight: thumbnailResolution
          })
        );
      }

      return Bluebird.all(all)
        .spread(function(targetInfo, thumbnailInfo) {
          var cleaner;
          if (withThumbnail) {
            cleaner = createCleaner(original, targetPath, withThumbnail, thumbnailPath);
          } else {
            cleaner = createCleaner(original, targetPath);
          }

          var result = {
            target: {
              info: targetInfo,
              stream: fs.createReadStream(targetInfo.filepath)
            },
            cleaner: cleaner
          };

          if (withThumbnail) {
            result.thumbnail = {
              info: thumbnailInfo,
              stream: fs.createReadStream(thumbnailInfo.filepath)
            };
          }

          return result;
        })
        .catch(function(err) {
          throw err;
        });
    });
};

exports.load = loadImage;
