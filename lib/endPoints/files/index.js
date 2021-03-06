//
// # Mongodb GridFs API Endpoint
//
var ObjectID = mongo.ObjectID;

(exports = module.exports = function(house, options){
    // This endpoint requires a data source
    var ds = options.ds;
    var filesRoot = ds.options.filesCol || options.collection;
    var col = filesRoot+'.files';
    var usersCol = 'users';
    var imagesCol = 'images';
    
    var updateUserIdWithDoc = function(userId, doc, cb) {
        ds.update(usersCol, {_id: userId}, doc, function(err, data) {
            if(err) {
                console.log(err);
            } else {
                if(cb) cb();
            }
        });
    }
    var incUserFileBytes = function(userId, b) {
        var updateDoc = {"$inc":{"fileBytes": b}};
        updateUserIdWithDoc(userId, updateDoc);
    }
    var incUserFileCount = function(userId, c) {
        var updateDoc = {"$inc":{"fileCount": c}};
        updateUserIdWithDoc(userId, updateDoc);
    }
    
    var handleReq = function(req, res, next) {
        var path = req.hasOwnProperty('urlRouted') ? req.urlRouted : req.url;
        var feedEndPoint = house.api.getEndPointByName("feed");
        var countQuery = function(query) {
            if(query.id) {
                query._id = query.id;
                delete query.id;
            }
            if(query.hasOwnProperty('_id') && typeof query._id == 'string') {
                try {
                    query._id = new ObjectID(query._id);
                } catch(e) {
                    console.log('bad object id');
                }
            }
            if(query.contentType && query.contentType.indexOf('/') === 0) {
                var opts = query.contentType.substr(query.contentType.lastIndexOf('/')+1);
                query.contentType = new RegExp(query.contentType.substr(1, query.contentType.lastIndexOf('/')-1), opts);
            }
            if(query.filename && query.filename.indexOf('/') === 0) {
                var opts = query.filename.substr(query.filename.lastIndexOf('/')+1);
                query.filename = new RegExp(query.filename.substr(1, query.filename.lastIndexOf('/')-1), opts);
            }
            if(query.hasOwnProperty('metadata.proc[$exists]')) {
                if(query['metadata.proc[$exists]'] == 'false') {
                    query['metadata.proc'] = {"$exists": false};
                } else {
                    query['metadata.proc'] = {"$exists": true};
                }
                delete query['metadata.proc[$exists]'];
            }
            if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
            } else {
                query["metadata.owner.id"] = req.session.data.user;
            }
            ds.count(col, query, function(err, data){
                if(err) {
                    house.log.err(err);
                } else {
                    res.setHeader('X-Count', data);
                    res.data({});
                }
            });
        }
        
        var findQuery = function(query, callback) {
            console.log('find query');
            console.log(query);
            
            if(query.id) {
                query._id = query.id;
                delete query.id;
            }
            if(query.hasOwnProperty('_id') && typeof query._id == 'string') {
                try {
                    query._id = new ObjectID(query._id);
                } catch(e) {
                    console.log('bad object id');
                }
            }
            
            if(query.limit) {
                query.limit = parseInt(query.limit, 10);
            }
            if(!query.limit || query.limit > 100) {
                query.limit = 25;
            }
            if(query.contentType && query.contentType.indexOf('/') === 0) {
                var opts = query.contentType.substr(query.contentType.lastIndexOf('/')+1);
                query.contentType = new RegExp(query.contentType.substr(1, query.contentType.lastIndexOf('/')-1), opts);
            }
            if(query.filename && query.filename.indexOf('/') === 0) {
                var opts = query.filename.substr(query.filename.lastIndexOf('/')+1);
                query.filename = new RegExp(query.filename.substr(1, query.filename.lastIndexOf('/')-1), opts);
            }
            if(query.hasOwnProperty('metadata.proc[$exists]')) {
                if(query['metadata.proc[$exists]'] == 'false') {
                    query['metadata.proc'] = {"$exists": false};
                } else {
                    query['metadata.proc'] = {"$exists": true};
                }
                delete query['metadata.proc[$exists]'];
            }
            if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
            } else {
                query["metadata.owner.id"] = req.session.data.user;
            }
            ds.find(col, query, function(err, data){
                if(err) {
                    house.log.err(err);
                } else if(data) {
                    res.data(data);
                } else {
                    house.log.err(new Error('no data from mongo'));
                }
            });
        }
        
        var insertDocToFeed = function(doc, callback) {
            var newFeedItem = {
                "ref": {"col": "files", "id": doc.id},
                "file": doc,
                "groups": doc.groups,
                "owner": doc.owner,
                "at": doc.at,
            }
            feedEndPoint({session: req.session, method: 'POST', url: '', fields: newFeedItem}, {end:function(){}, data:function(newFeedData){
                if(_.isArray(newFeedData)) {
                    newFeedData = _.first(newFeedData);
                }
                ds.update(col, {"_id": doc.id}, {"$set": {"feed": {id:newFeedData.id,at:newFeedData.at}}}, function(err, data) {
                    if(callback) {
                        callback(newFeedData);
                    }
                });
            },writeHead:function(){}});
        }
        var updateDocInFeed = function(doc) {
            var updateDoc = {
                "$set": {
                    "file": doc,
                    "groups": doc.groups,
                    "owner": doc.owner,
                    "at": doc.at,
                }
            }
            feedEndPoint({session: req.session, method: 'PUT', url: '/'+doc.feed.id, fields: updateDoc}, {end:function(){}, data:function(newFeedData){
                if(_.isArray(newFeedData)) {
                    newFeedData = _.first(newFeedData);
                }
            },writeHead:function(){}});
        }
        var removeDocFromFeed = function(doc) {
            if(doc.feed && doc.feed.id) {
                feedEndPoint({session: req.session, method: 'DELETE', url: '/'+doc.feed.id, fields: {delete: true}}, {end:function(){}, data:function(newFeedData){
                },writeHead:function(){}});
            } else if(doc.id) {
                var feedQuery = {"ref": {"col": "files", "id": doc.id}};
                ds.find('feed', feedQuery, function(err, data) {
                    _.each(data, function(e) {
                        var docId = e.id;
                        house.io.rooms.in('feed').emit('deletedFeed', docId);
                    });
                    ds.remove('feed', feedQuery, function(err, data) {
                    });
                });
            }
        }
        
        var docId;
        
        if(path.length > 1 && path.indexOf('/') === 0) {
            var docId = path.substr(1);
            try {
                docId = new ObjectID(docId);
            } catch(e) {
            }
        }
        
        if(req.method == 'GET' || req.method == 'HEAD') {
            var query = {};
            
            if(path === '' || path === '/') {
                if(req.method == 'HEAD') {
                    countQuery(query);
                } else {
                    findQuery(query);
                }
            } else {
                var filename = decodeURIComponent(path.substr(1));
                mongo.GridStore.exist(ds.db, filename, filesRoot, function(err, result) {
                    if(result) {
                        house.utils.media.gridfs.getReadableFile(ds.db, filesRoot, filename).open(function(err, gs){
                            var resCode = 200;
                            var offset = 0;
                            var etag = '"'+gs.length+'-'+gs.uploadDate+'"';
                            var headerFields = {
                                'Content-Type': gs.contentType
                                , 'Date': gs.uploadDate
                            	, 'ETag': etag
                            };
                            
                            // check for permission to the file
                            var hasPermission = false;
                            var meta = gs.metadata;
                            if(meta) {
                                if(req.session.data.user && req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
                                    hasPermission = true;
                                } else if(req.session.data.user && meta.hasOwnProperty('owner') && (meta.owner.id.toString() == req.session.data.user.toString())) {
                                    hasPermission = true;
                                } else if(meta.hasOwnProperty('groups')) {
                                    if(meta.groups && meta.groups.indexOf('public') != -1) {
                                        hasPermission = true;
                                    } else if(req.session.data.hasOwnProperty('groups')) {
                                        if(req.session.data.groups.indexOf('admin') !== -1) {
                                            hasPermission = true;
                                        } else if(meta.groups) {
                                            for(var g in meta.groups) {
                                                var group = meta.groups[g];
                                                if(req.session.data.groups.indexOf(group) !== -1) {
                                                    hasPermission = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                            if(!hasPermission) {
                                // throw them out
                                house.log.debug('user does not have permission to this file');
                                house.log.debug(req.session.data);
                                if(meta) {
                                    house.log.debug(meta);
                                }
                                next();
                                return;
                            }
                            
                            if(req.method == 'HEAD') {
                                //console.log('HEAD');
                                headerFields["Content-Length"] = gs.length;
                                headerFields["Accept-Ranges"] = 'bytes';
                                gs.close(function(){
                                    //house.log.debug('gridstore closed');
                                    res.writeHead(200, headerFields);
                                    res.end('');
                                });
                                return;
                            }
                            
                            if(req.headers['if-none-match'] == etag){
                              resCode = 304;
                              headerFields['Content-Length'] = 0;
                              gs.close(function(){
                                  res.writeHead(resCode, headerFields);
                                  res.end();
                              });
                              return;
                            }
                            
                            var contentLen = gs.length;
                            var bytStr = 'bytes=';
                            var chunkSize = 4096
                            , lengthRemaining = gs.length;
                            
                            if(req.headers.range && req.headers.range.substr(0,bytStr.length) == bytStr) {
                                house.log.debug('range '+req.headers.range);
                            	var rangeString = '';
                                var bytSelection = req.headers.range.substr(bytStr.length);
                            	var bytDashPos = bytSelection.indexOf('-');
                            	var bytPreDash = bytSelection.substr(0, bytDashPos);
                            	var bytEndDash = bytSelection.substr(bytDashPos+1);
                            	resCode = 206;
                                delete headerFields['ETag'];
                            	if(bytPreDash == '0') {
                            		if(bytEndDash) {
                            			contentLen = parseInt(bytEndDash);
                                        rangeString = bytPreDash + '-' + bytEndDash;
                            		} else {
                            		    rangeString = '0-' + (gs.length-1).toString();
                            		}
                            	} else if(bytEndDash != '' && bytPreDash != '') {
                            		contentLen = parseInt(bytEndDash) - parseInt(bytPreDash);
                            		offset = parseInt(bytPreDash);
                            		rangeString = bytPreDash + '-' + bytEndDash;
                            	} else if(bytEndDash == '' && bytPreDash != '') {
                                    // ex, 1234-
                            		contentLen = contentLen - parseInt(bytPreDash);
                            		offset = parseInt(bytPreDash) - 1;
                            		rangeString = bytPreDash + '-' + (gs.length - 1).toString();
                            	}
                            	headerFields["Content-Range"] = 'bytes ' + rangeString+'/'+gs.length; // needs to always be the full content length? // req.headers.range; //bytSelection; // should include bytes= ???
                            	headerFields["Vary"] = "Accept-Encoding";
                                lengthRemaining = contentLen;
                            }
                            
                            house.log.debug(resCode+' '+filename+' as: '+gs.contentType+' with length: ' + contentLen, resCode);
                            headerFields["Content-Length"] = contentLen;
                            //headerFields["Accept-Ranges"] = 'bytes'; // enables scrubbing in chrome
                            
                        	house.log.debug(headerFields);
                            res.writeHead(resCode, headerFields);
                            
                            if(lengthRemaining < chunkSize) {
                              chunkSize = lengthRemaining;
                            }
                            
                            var gridStoreReadChunk = function(gs) {
                                var readAndSend = function(chunk) {
                                  gs.read(chunk, function(err, data) {
                                	if(err) {
                                	  house.log.err('file read err: '+filename);
                                	  house.log.err(err);
                                      gs.close(function(){
                                          house.log.debug('gridstore closed');
                                      });
                                      res.end();
                                      return;
                                	} else {
                                		
                                      res.write(data, 'binary');
                                      lengthRemaining = lengthRemaining - chunk;
                                      
                                      if(lengthRemaining < chunkSize) {
                                        chunkSize = lengthRemaining;
                                      }
                                    }
                                    
                                    if(lengthRemaining == 0) {
                                      // close the gridstore
                                      gs.close(function(){
                                          house.log.debug('gridstore closed');
                                      });
                                      res.end();
                                    } else {
                                      readAndSend(chunkSize);
                                    }
                                  }); // read
                                }
                                if(chunkSize > 0) {
                                  readAndSend(chunkSize);
                                }
                            }
                            if(offset != 0) {
                                 gs.seek(offset, function(err, gs) {
                                 	if(err) {
                                 		house.log.err('err');
                                 	}
                                 	gridStoreReadChunk(gs);
                                 });
                            } else {
                                 gridStoreReadChunk(gs);
                            }
                        });
                        
                    } else {
                       if(err) {
                           house.log.err(err);
                           res.end('error');
                       } else {
                           try {
                                var fid = new ObjectID(filename);
                                findQuery({_id: fid});
                           } catch(e) {
                               
                               if(req.query && path.indexOf('?') === 0) {
                                   if(req.method == 'HEAD') {
                                       countQuery(req.query);
                                   } else {
                                       findQuery(req.query);
                                   }
                               } else {
                                   console.log(e);
                                   res.end('file does not exist');
                               }
                           }
                           //res.end('file does not exist');
                       }
                    }
                });
            }
            
        } else if(req.method == 'POST') {
            house.log.debug('post to files (upload)');
            console.log(req.metadata)
            var procFile = function(file, callback) {
                var fileMeta = {};
                if(req.hasOwnProperty('fields') && req.fields.hasOwnProperty('metadata')) {
                    try {
                        var meta = JSON.parse(req.fields.metadata);
                        for(var meta_field in meta) {
                            fileMeta[meta_field] = meta[meta_field];
                        }
                    } catch(e) {
                        house.log.err(e);
                    }
                }
                if(req.session.data) {
                    var owner = {
                        id: req.session.data.user,
                        name: req.session.data.name
                    }
                    fileMeta.owner = owner;
                    
                    house.utils.media.gridfs.importFile(ds.db, filesRoot, 'uploads/'+file.filename, file.path, file.type, fileMeta, function(err, data){
                        console.log('gridfs import file upload done');
                        console.log(data)
                        data.id = data._id;
                        delete data._id;
                        if(err) {
                            console.log('file upload err');
                            console.log(err);
                        } else {
                            // inc users fileBytes
                            incUserFileBytes(owner.id, data.length);
                            // inc users fileCount
                            incUserFileCount(owner.id, 1);
                            
                            if(data.contentType.indexOf('audio') === 0) {
                                //console.log('proces audio upload');
                                house.utils.media.exif.getFromPath(file.path).result(function(exif){
                                    //console.log('metadata');
                                    //console.log(exif);
                                
                                    var newSong = {
                                        file_id: data._id,
                                        filename: data.filename,
                                        ss: ''
                                    }
                                    if(exif.Title) {
                                        newSong.title = exif.Title;
                                        newSong.ss += exif.Title;
                                    }
                                    if(exif.Album) {
                                        newSong.album = exif.Album;
                                        newSong.ss += ' '+exif.Album;
                                    }
                                    if(exif.Artist) {
                                        newSong.artist = exif.Artist;
                                        newSong.ss += ' '+exif.Artist;
                                    }
                                    if(exif.Year) {
                                        newSong.year = exif.Year;
                                    }
                                    if(exif.Genre) {
                                        newSong.genre = exif.Genre;
                                    }
                                    if(exif.Duration) {
                                        newSong.duration = exif.Duration;
                                        var iof = newSong.duration.indexOf(' (approx)');
                                        if(iof !== -1) {
                                            newSong.duration = newSong.duration.substr(0,iof);
                                        }
                                        var dArr = newSong.duration.split(':');
                                        var secs = parseInt(dArr.pop(), 10);
                                        var mins = parseInt(dArr.pop(), 10);
                                        
                                        newSong.duration = (mins * 60) + secs;
                                    }
                                    if(exif.Lyrics) {
                                        newSong.lyrics = exif.Lyrics;
                                    }
                                    // picture
                                    // track
                                    // lyrics
                                    
                                    // user uploading the song
                                    newSong.owner = owner;
                                    
                                    ds.insert('songs', newSong, function(err, songData) {
                                        //console.log('new song!');
                                        callback({song: songData, file: data});
                                    });
                                });
                            } else if(data.contentType.indexOf('image') === 0) {
                                house.utils.media.exif.getFromPath(file.path, function(exif){
                                    processImage(data, exif, function(newImageData, updatedFile){
                                        callback({image: newImageData, file: updatedFile});
                                    });
                                });
                            } else {
                                console.log('non-media upload done');
                                callback({file:data});
                            }
                        }
                    });
                }
            }
            
            if(path == '') {
                var datas = [];
                var requestFiles = [];
                if(req.files) {
                    for(var i in req.files) {
                        requestFiles.push(req.files[i]);
                    }
                    
                    var procNextFile = function(){
                        var file = requestFiles.pop();
                        procFile(file, function(data){
                            datas.push(data);
                            fs.unlink(file.path, function(){
                                console.log('file unlinked from tmp');
                            });
                            if(requestFiles.length > 0) {
                                procNextFile();
                            } else {
                                // done
                                res.data(datas);
                            }
                        });
                    }();
                }
            }
        } else if(req.method == 'PUT') {
            if(!req.session.data.user) {
                res.writeHead(403);
                res.end('{}');
                return;
            }
            house.log.debug('files PUT');
            house.log.debug('from user '+req.session.data.user);
            house.log.debug(req.fields);
            var query = {};
            if(docId) {
                house.log.debug('docId: '+docId);
                query._id = docId;
                
                if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
                } else {
                    query['metadata.owner.id'] = req.session.data.user;
                }
                if(req.fields.hasOwnProperty('$set') && req.fields['$set'].hasOwnProperty('metadata.proc')) {
                    ds.find(col, query, function(err, data) {
                        console.log(data)
                        data = _.first(data);
                        if(data.contentType.indexOf('audio') === 0) {
                        } else if(data.contentType.indexOf('image') === 0) {
                            processImage(data, function(newImageData, updatedFile){
                                console.log('proc image from PUT complete');
                                console.log(arguments);
                                res.data({file: updatedFile, image: newImageData});
                            });
                        } else {
                        }
                    });
                } else {
                    ds.update(col, query, req.fields, function(err, data){
                        if(err) {
                            house.log.err(err);
                            res.end('error');
                        } else {
                            house.log.debug(data);
                            res.data(data);
                        }
                    });
                }
            }
        } else if(req.method == 'DELETE') {
            house.log.debug('files DELETE');
            if(!req.session.data.user) {
                res.writeHead(403);
                res.end('{}');
                return;
            }
            var query = {};
            var ownerId = req.session.data.user;
            if(docId) {
                query._id = docId;
                house.log.debug('id: '+docId);
                if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
                } else {
                    query["metadata.owner.id"] = ownerId;
                }
                ds.find(col, query, function(err, data){
                    if(err) {
                        house.log.err(err);
                    } else if(data) {
                        var file = _.first(data);
                        house.log.debug('filename: '+file.filename);
                        // dec users file bytes used
                        incUserFileBytes(ownerId, (data[0].length * -1));
                        
                        // dec users fileCount
                        incUserFileCount(ownerId, -1);
                        
                        mongo.GridStore.unlink(ds.db, file.filename, {root: filesRoot}, function(err, gridStore){
                            if(err) {
                                house.log.err(err);
                                res.end('error');
                            } else {
                                console.log('deleted file');
                                res.data({});
                            }
                        });
                    } else {
                        house.log.err(new Error('no data from mongo'));
                    }
                });
            }
        } else if(req.method == 'OPTIONS') {
            console.log('OPTIONS');
        } else {
            if(req.method) {
                console.log('bad method '+req.method);
            } else {
                console.log('NO method!');
            }
        }
        var processImage = function(file, exif, callback) {
            console.log('processImage '+file.filename)
            var newImage = {
                "filename": file.filename
                , "ref": {"col": col, "id": file.id}
            }
            if(typeof exif == 'object') {
                newImage.exif = exif;
            } else if(typeof exif == 'function') {
                callback = exif;
            }
            if(file.metadata.hasOwnProperty('exif')) {
                newImage.exif = file.metadata.exif;
            }
            if(file.metadata.hasOwnProperty('groups')) {
                newImage.groups = file.metadata.groups;
            }
            
            if(file.metadata.subject) {
                newImage["caption"] = file.metadata.subject;
            }
            if(file.metadata.body) {
                // parse body for tags and groups
                var b = file.metadata.body;
                //newImage["tags"] = file.metadata.subject;
                var blines = b.split('\n');
                for(var i in blines) {
                    var bline = blines[i];
                    var tags;
                    var groups;
                    var ts = 'Tags: ';
                    var gs = 'Groups: ';
                    if(bline.indexOf(ts) === 0) {
                        tags = bline.substring(ts.length);
                        tags = tags.split(', ');
                        for(var t in tags) {
                            tags[t] = tags[t].trim();
                        }
                    }
                    if(bline.indexOf(gs) === 0) {
                        groups = bline.substring(gs.length);
                        groups = groups.split(', ');
                        for(var g in groups) {
                            groups[g] = groups[g].trim();
                        }
                    }
                }
                
                if(tags) {
                    newImage["tags"] = tags;
                }
                if(groups) {
                    newImage["groups"] = groups;
                }
            }
            
            var imagesEndPoint = house.api.getEndPointByName(imagesCol);
            imagesEndPoint.call(this, {session: req.session, method: 'POST', url: '', fields: newImage}, {end:function(){}, data:function(newImageData){
                console.log('images response for newImage '+newImage.filename);
                console.log(newImageData);
                var updateFileDoc = {
                    "$push": {
                        "metadata.refs": {
                            "col": imagesCol
                            , "id": newImageData.id
                        }
                    }
                    , "$set": {
                        "metadata.proc": 1
                    }
                };
                
                ds.update(col, {"_id": file.id}, updateFileDoc, function(err, updateData) {
                    ds.find(col, {"_id": file.id}, function(err, updatedFile) {
                        if(updatedFile.length > 0) {
                            if(callback) {
                                callback(newImageData, _.first(updatedFile));
                            }
                        }
                    });
                });
            },writeHead:function(){}});
            
            //ds.insert(imagesCol, newImage, function(err, newImageData) {
            //});
        }
    }
    
    return handleReq;
});
