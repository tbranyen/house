(function() {
    
    var Paper = Backbone.Model.extend({
        collectionName: "wallpaper",
        initialize: function(attr, opts) {
            this.on("change", function(model, options){
            });
        },
        getFullView: function(options) {
            options = options || {};
            options.id = this.get("_id");
            options.model = this;
            if (!this.fullView) {
                this.fullView = new PaperFullView(options);
            }
            return this.fullView;
        },
        getAvatar: function(options) {
            options = options || {};
            options.id = this.get("_id");
            options.model = this;
            if (!this.avatar) {
                this.avatar = new PaperAvatar(options);
            }
            return this.avatar;
        },
        getRow: function(options) {
            options = options || {};
            options.id = this.get("_id");
            options.model = this;
            if (!this.row) {
                this.row = new PaperRow(options);
            }
            return this.row;
        }
    });
    
    var Wallpaper = Backbone.Collection.extend({
        model: Paper,
        collectionName: 'wallpaper',
        url: '/api/wallpaper',
        initialize: function() {
            var self = this;
            self.pageSize = 10;
            this.resetFilters();
        },
        headCount: function(callback) {
            var self = this;
            var aj = $.ajax({
                type: "HEAD",
                url: self.url,
                data: {},
                success: function(json) {
                    callback(aj.getResponseHeader('X-Count'));
                },
                xhrFields: {
                    withCredentials: true
                }
            });
        },
        refreshCount: function() {
            var self = this;
            self.headCount(function(count){
                self.count = count;
                self.trigger('colCount', count);
            });
        },
        load: function(options, success) {
            var self = this;
            
            if(!this.count) {
                this.refreshCount();
            }
            
            if(!options) {
                options = {};
            }
            if(!options.limit) {
                options.limit = self.pageSize;
            }
            
            if(!options.sort) {
                options.sort = "at-";
            }
            
            this.applyFilters(options);
                    
            this.fetch({data: options, add: true, success: function(collection, response){
                    if(success) {
                        success();
                    }
                },
                error: function(collection, response){
                }
            });
        },
        getNextPage: function() {
            if(this.length < this.count) {
                this.load({skip:this.length});
            }
        },
        applyFilters: function(options) {
            
        },
        updateFilter: function(filter) {
            this.reset();
            this.load();
        },
        comparator: function(doc) {
            var d;
            if(doc.get("at")) {
                d = new Date(doc.get("at")).getTime();
                return d * -1;
            } else {
                return 1;
            }
        },
        resetFilters: function() {
        },
        getOrFetch: function(id, callback) {
            var self = this;
            var doc;
            doc = this.get(id);
            if(doc) {
                callback(doc);
            } else {
                var options = { "_id": id };
                this.fetch({data: options, add: true, success: function(collection, response){
                        if(response) {
                            doc = self.get(id);
                            callback(doc);
                        } else {
                            callback(false);
                        }
                    },
                    error: function(collection, response){
                        callback(false);
                    }
                });
            }
        },
        getView: function(options) {
            var self = this;
            if (!options) options = {};
            if (!this.hasOwnProperty("view")) {
                options.collection = this;
                this.view = new WallpaperList(options);
                this.view.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.view;
        },
    });
    
    var WallpaperList = Backbone.View.extend({
        layout: 'fullView',
        initialize: function() {
            var self = this;
            this.$pager = $('<div id="wallpaper-list-pager">showing <span class="wallpaper-list-length"></span> of <span class="wallpaper-list-count"></span> wallpaper</div>');
            var $ul = this.$ul = $('<ul id="wallpaper"></ul>');
            
            this.collection.bind("add", function(doc) {
                var view;
                if(self.layout === 'row') {
                    view = doc.getRow({list: self});
                } else if(self.layout === 'avatar') {
                    view = doc.getAvatar({list: self});
                } else if(self.layout === 'fullView') {
                    view = doc.getFullView({list: self});
                }
                self.appendRow(view.render().el);
                self.renderPager();
            });
            
            this.collection.on('reset', function(){
                self.render();
            });
        },
        events: {
          "click #wallpaper-list-pager": "loadMore",
        },
        loadMore: function() {
            this.collection.getNextPage();
        },
        render: function() {
            var self = this;
            this.$el.html('');
            this.$el.append(this.$ul);
            this.$ul.html('');
            //this.collection.sort({silent:true});
            this.collection.each(function(doc){
                var view;
                if(self.layout === 'row') {
                    view = doc.getRow({list: self});
                } else if(self.layout === 'avatar') {
                    view = doc.getAvatar({list: self});
                } else if(self.layout === 'fullView') {
                    view = doc.getFullView({list: self});
                }
                
                self.appendRow(view.render().el);
            });
            this.$el.append(this.$pager);
            this.renderPager();
            this.trigger('resize');
            this.setElement(this.$el);
            return this;
        },
        renderPager: function() {
            var len = this.collection.length;
            var c = this.collection.count > len ? this.collection.count : len;
            this.$pager.find('.wallpaper-list-length').html(len);
            this.$pager.find('.wallpaper-list-count').html(c);
        },
        refreshPager: function() {
        },
        appendRow: function(row) {
            this.$ul.append(row);
        }
    });
    
    var PaperActions = Backbone.View.extend({
        tagName: "span",
        className: "actions",
        render: function() {
            var self = this;
            this.$el.html('');
            //self.$el.append(this.tags.render().$el);
            //self.$el.append(this.groups.render().$el);
            self.$el.append(this.actionDelete.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            this.actions = [];
            //this.groups = new Groups({id: this.id, model: this.model});
            //this.tags = new Tags({id: this.id, model: this.model});
            this.actionDelete = new ActionDelete({id: this.id, model: this.model});
        }
    });

    var ActionDelete = Backbone.View.extend({
        tagName: "span",
        className: "delete",
        render: function() {
            this.$el.html('<button>delete</button>');
            this.$el.removeAttr('id');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            
        },
        events: {
          "click": "select",
        },
        select: function() {
            var self = this;
            
            if(confirm("Are you sure that you want to delete this?")) {
                this.model.destroy({success: function(model, response) {
                  //console.log('delete');
                  window.history.back(-1);
                }, 
                errorr: function(model, response) {
                    console.log(arguments);
                },
                wait: true});
            }
            return false;
        }
    });
    
    var PaperTags = Backbone.View.extend({
        tagName: "span",
        className: "tags",
        render: function() {
            this.$el.html('');
            var tags = this.model.get("tags");
            if(tags) {
                for(var i in tags) {
                    var tagName = tags[i];
                    if(!_.isString(tagName)) {
                        var $btn = $('<button class="tag">'+tagName+'</button>');
                        $btn.attr('data-tag', JSON.stringify(tagName));
                        this.$el.append($btn);
                    } else {
                        this.$el.append('<button class="tag">'+tagName+'</button>');
                    }
                }
            }
            this.$el.append('<button class="newTag">+ tag</button>');
            this.$el.removeAttr('id');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click .newTag": "newTag",
          "click .tag": "removeTag"
        },
        removeTag: function(e) {
            var self = this;
            if(confirm("Are you sure that you want to remove this tag?")) {
                var tags = this.model.get("tags");
                var $tag = $(e.target);
                var tagName = '';
                if($tag.attr('data-tag')) {
                    tagName = JSON.parse($tag.attr('data-tag'));
                } else {
                    tagName = e.target.innerHTML;
                }
                this.model.pull({"tags": tagName}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        newTag: function() {
            var self = this;
            var tagName = prompt("Enter tags, separated, by commas.");
            if(tagName) {
                tagName = tagName.split(',');
                for(var i in tagName) {
                    var tag = tagName[i];
                    tagName[i] = tag.trim(); // trim extra white space
                }
                if(tagName) {
                    if(!this.model.has("tags")) {
                        this.model.set({'tags': tagName}, {silent: true});
                        var saveModel = this.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        saveModel.done(function() {
                            console.log('tags saved');
                        });
                    } else {
                        this.model.pushAll({"tags": tagName}, {silent: true});
                        var saveModel = this.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        saveModel.done(function() {
                            self.render();
                        });
                    }
                }
            }
        }
    });

    var PaperGroups = Backbone.View.extend({
        tagName: "span",
        className: "groups",
        initialize: function() {
        },
        render: function() {
            this.$el.html('');
            var groups = this.model.get("groups");
            if(groups) {
                for(var i in groups) {
                    var groupName = groups[i];
                    this.$el.append('<button class="group">'+groupName+'</button>');
                }
                if(groups.indexOf('public') === -1) {
                    this.$el.append('<button class="publicGroup">+ public</button>');
                }
                if(groups && groups.length > 0) {
                    this.$el.append('<button class="privateGroup">+ private</button>');
                }
            }
            this.$el.append('<button class="newGroup">+ group</button>');
            this.$el.removeAttr('id');
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click .newGroup": "newGroup",
          "click .group": "removeGroup",
          "click .publicGroup": "publicGroup",
          "click .privateGroup": "privateGroup"
        },
        privateGroup: function() {
            var self = this;
            if(confirm("Are you sure that you want to make this private?")) {
                this.model.set({"groups": []}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        publicGroup: function() {
            var self = this;
            if(confirm("Are you sure that you want to make this public?")) {
                this.model.push({"groups": "public"}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        removeGroup: function(e) {
            var self = this;
            if(confirm("Are you sure that you want to remove this group?")) {
                var groups = this.model.get("groups");
                var name = e.target.innerHTML;
                this.model.pull({"groups": name}, {silent: true});
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        },
        newGroup: function() {
            var self = this;
            var groupName = prompt("Enter groups, separated, by commas.");
            groupName = groupName.split(',');
            
            for(var i in groupName) {
                var g = groupName[i];
                groupName[i] = g.trim(); // trim extra white space
            }
            if(groupName) {
                if(!this.model.get("groups")) {
                    this.model.set({'groups': groupName}, {silent: true});
                } else {
                    this.model.pushAll({"groups": groupName}, {silent: true});
                }
                var saveModel = this.model.save(null, {
                    silent: false,
                    wait: true
                });
                saveModel.done(function() {
                    self.render();
                });
            }
        }
    });

    var PaperRow = Backbone.View.extend({
        tagName: "li",
        className: "paperRow",
        initialize: function(options) {
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            this.$actions = $('<div class="actions"></div>');
            this.imageActions = new ImageActions({id: this.id, model: this.model});
        },
        render: function() {
            this.$el.html('paper');
            this.$el.append(this.$actions);
            this.$actions.append(this.imageActions.render().el);
            this.trigger('resize');
            this.setElement(this.$el); // hmm - needed this to get click handlers //this.delegateEvents(); // why doesn't this run before
            return this;
        },
        events: {
          "click": "select"
        },
        select: function(e) {
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    
    var PaperFullView = Backbone.View.extend({
        tagName: "div",
        className: "paperFullView",
        initialize: function(options) {
            var self = this;
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('destroy', this.remove, this);
    
            this.$actions = $('<div class="actions"></div>');
            this.paperActions = new PaperActions({id: this.id, model: this.model});
            
        },
        render: function() {
            var self = this;
            this.$el.html('');
            this.$el.append(this.$actions);
            this.$actions.append(this.paperActions.render().el);
            this.trigger('resize');
            this.setElement(this.$el); // hmm - needed this to get click handlers //this.delegateEvents(); // why doesn't this run before
            return this;
        },
        renderActions: function() {
            this.paperActions.render();
        },
        show: function() {
            this.$el.show();
        },
        events: {
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    
    var PaperAvatar = Backbone.View.extend({
        tagName: "li",
        className: "paperAvatar",
        initialize: function(options) {
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
        },
        render: function() {
            this.$el.html('paper avatar');
            this.$el.append(this.$actions);
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click": "select"
        },
        select: function(e) {
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    
    var PaperForm = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            self.initialized = false;
            require(['../files/files.js'], function(FilesBackbone){
                self.newFileForm = new FilesBackbone.FileForm({collection: self.filesCollection, type: 'image'});
                self.newFileForm.on('upload', function(data){
                    if(data.image) {
                        self.renderImage(data.image);
                    }
                });
                self.trigger('initialized');
                self.initialized = true;
            });
        },
        render: function() {
            var self = this;
            if(!this.initialized) {
                this.on('initialized', function(){
                    self.render();
                });
            }
            this.$el.html('<h4>Wallpaper</h4><form id="newWallpaperForm"><span class="image"></span><textarea name="paperScript" placeholder="javascript"></textarea><textarea name="paperCss" placeholder="css"></textarea><input type="submit" value="Save" /></form>');
            if(this.newFileForm) {
                this.$el.find(".image").append(this.newFileForm.render().$el);
            }
            this.setElement(this.$el);
            return this;
        },
        renderImage: function(image) {
            var $img = this.$el.find('.image');
            $img.html('<img src="/api/files/'+image.filename+'" />');
            $img.attr("data-id", image.id);
            $img.attr("data-filename", image.filename);
        },
        events: {
            "submit form": "submit",
            "click button.attachPhoto": "attachPhoto"
        },
        attachPhoto: function() {
            this.$el.find('input[type="file"]').show();
            this.$el.find('input[type="file"]').click();
            return false;
        },
        addImage: function(data) {
            console.log(data);
            var $previewImg = $('<img src="/api/files/' + data.file.filename + '" />');
            var $img = this.$el.find(".image");
            $img.append($previewImg);
            $img.attr("data-id", data.file._id);
            $img.attr("data-filename", data.file.filename);
            this.$el.find('input[type="file"]').hide();
        },
        submit: function() {
            var self = this;
            var $img = this.$el.find(".image");
            console.log($img.attr("data-id"));
            var newDoc = {};
            if ($img.attr("data-id") && $img.attr("data-filename")) {
                newDoc.image = {
                    id: $img.attr("data-id"),
                    filename: $img.attr("data-filename")
                };
            }
            var paperScriptVal = $('[name="paperScript"]').val();
            var paperCssVal = $('[name="paperCss"]').val();
            if(paperScriptVal) {
                newDoc.script = paperScriptVal;
            }
            if(paperCssVal) {
                newDoc.css = paperCssVal;
            }
            var m = new Paper({}, {
                collection: this.collection
            });
            m.set(newDoc);
            var s = m.save(null, {
                silent: true,
                wait: true
            });
            s.done(function() {
                self.trigger("saved", m);
                self.collection.add(m);
            });
            return false;
        },
        focus: function() {},
        remove: function() {
            $(this.el).remove();
        }
    });
    
    if(define) {
        define(function () {
            return {
                Collection: Wallpaper,
                Model: Paper,
                List: WallpaperList,
                Row: PaperRow,
                Avatar: PaperAvatar,
                Form: PaperForm
            }
        });
    }
})();