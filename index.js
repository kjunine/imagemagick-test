'use strict';

var fs = require('fs'),
    path = require('path'),
    Bluebird = require('bluebird'),
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

var load = function(file) {
  var target = rename(file, '.targets');
  var thumbnail = rename(file, '.thumbnails');

  PhotoUtil
    .load(file, {
      workingDirectory: '.tmp',
      // format: 'jpg',
      withThumbnail: true,
      thumbnailFormat: 'jpg'
    })
    .then(function(result) {
      console.log(file, '-> target:', result.target.info);
      console.log(file, '-> thumbnail:', result.thumbnail.info);

      return Bluebird.all([
        result.cleaner,
        write(target, result.target.stream),
        write(thumbnail, result.thumbnail.stream)
      ]);
    })
    .spread(function(cleaner) {
      return cleaner.clean();
    })
    .catch(function(err) {
      console.error(file, '-> err:', err);
    });
};

traverse('.tmp', clean);
traverse('.thumbnails', clean);
traverse('.targets', clean);

traverse('images', load);
