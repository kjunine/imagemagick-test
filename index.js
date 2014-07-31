'use strict';

var fs = require('fs'),
    path = require('path'),
    sprintf = require('sprintf-js').sprintf,
    Bluebird = require('bluebird'),
    _ = require('lodash'),
    PhotoUtil = require('./photo');

var traverse = function(directory, callback) {
  var dir = path.join(__dirname, directory);
  fs.readdirSync(dir)
    .forEach(function (file) {
      if (/\.(gif|png|jpg|jpeg)$/.test(file)) {
        callback(path.join(dir, file));
      }
    });
};

var rename = function(file, keyword) {
  var name = path.basename(file);
  return path.join(__dirname, keyword, name);
};

var write = function(target, reader) {
  var writer = fs.createWriteStream(target);
  var deferred = Bluebird.defer();
  reader.on('close', function() {
    deferred.resolve();
  });
  reader.on('err', function(err) {
    deferred.reject(err);
  });
  reader.pipe(writer);
  return deferred.promise;
};

var clean = function(file) {
  fs.unlinkSync(file);
};

var size = function(size) {
  if (size < 1024) {
    return sprintf('%7f_B', size);
  } else if (size < 1024 * 1024) {
    return sprintf('%7.2fKB', size / 1024);
  } else if (size < 1024 * 1024 * 1024) {
    return sprintf('%7.2fMB', size / 1024 / 1024);
  }
};

var info = function(info) {
  return sprintf('%4s, %5dx%5d, %s, %2d, %d, %3d, %s',
    info.format, info.width, info.height, size(info.filesize),
    info.scenes, info.depth, info.quality, info.density);
};

var load = function(file) {
  var target = rename(file, '.targets');
  var thumbnail = rename(file, '.thumbnails');

  return PhotoUtil
    .load(file, {
      workingDirectory: '.tmp',
      // format: 'jpg',
      withThumbnail: true,
      // thumbnailFormat: 'jpg'
    })
    .then(function(result) {
      return Bluebird.all([
        result.cleaner,
        sprintf('%10s -> %9s: %s', path.basename(file), 'target', info(result.target.info)),
        sprintf('%10s -> %9s: %s', path.basename(file), 'thumbnail', info(result.thumbnail.info)),
        write(target, result.target.stream),
        write(thumbnail, result.thumbnail.stream)
      ]);
    })
    .spread(function(cleaner, targetOutput, thumbnailOutput) {
      return cleaner.clean()
        .then(function() {
          return [targetOutput, thumbnailOutput];
        });
    })
    .catch(function(err) {
      console.error(file, '-> err:', err);
    });
};

traverse('.tmp', clean);
traverse('.thumbnails', clean);
traverse('.targets', clean);

var promise = Bluebird.resolve();
var targetOutputs = [];
var thumbnailOutputs = [];

traverse('images', function(file) {
  promise = promise.then(function() {
    return load(file)
      .spread(function(targetOutput, thumbnailOutput) {
        targetOutputs.push(targetOutput);
        thumbnailOutputs.push(thumbnailOutput);
      });
  });
});

promise.then(function() {
  _.each(targetOutputs, function(targetOutput) {
    console.log(targetOutput);
  });
  _.each(thumbnailOutputs, function(thumbnailOutput) {
    console.log(thumbnailOutput);
  });
});
