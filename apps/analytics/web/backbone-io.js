(function() {
    var Model = Backbone.Model.extend({
        collectionName: "io",
        initialize: function(attr, opts) {
            var colOpts = {
                image: this
            };
            this.on("change", function(model, options) {
                console.log(arguments);
            });
            this.views = {};
        },
        getOwner: function(callback) {
            if (this.has("session").user) {
                var user = window.usersCollection.getOrFetch(this.get("session").user, callback);
            }
        },
        getFullView: function(options) {
            options = options || {};
            options.model = this;
            if (!this.fullView) {
                var view = this.fullView = new FullView(options);
                view.on("goToProfile", function(model) {
                    options.list.trigger("goToProfile", model);
                });
                this.views.fullView = view;
            }
            return this.fullView;
        },
        getAvatar: function(options) {
            options = options || {};
            options.model = this;
            if (!this.avatar) {
                var view = this.avatar = new AvatarView(options);
                this.views.avatar = view;
            }
            return this.avatar;
        },
        getRow: function(options) {
            options = options || {};
            options.model = this;
            if (!this.row) {
                var row = this.row = new RowView(options);
                this.views.row = row;
            }
            return this.row;
        },
        renderViews: function() {
            for (var i in this.views) {
                this.views[i].render();
            }
        },
        getNavigatePath: function() {
            return "id/" + this.id;
        }
    });
    var Collection = Backbone.Collection.extend({
        model: Model,
        collectionName: "io",
        url: "/api/io",
        initialize: function() {
            var self = this;
            self.pageSize = 10;
            this.resetFilters();
            require([ "//" + window.location.host + "/desktop/socket.io.min.js" ], function() {
                var socketOpts = {};
                if (window.location.protocol.indexOf("https") !== -1) {
                    socketOpts.secure = true;
                } else {
                    socketOpts.secure = false;
                }
                var socket = self.io = io.connect("//" + window.location.host + "/socket.io/io", socketOpts);
                socket.on("connect", function(data) {
                    console.log("connected and now joining " + self.collectionName);
                    socket.emit("join", self.collectionName);
                });
                socket.on('connecting', function () {
                    console.log("connecting " + self.collectionName);
                });
                socket.on('connect_failed', function () {
                    console.log("connect_failed " + self.collectionName);
                });
                socket.on('disconnect', function () {
                    console.log("disconnect " + self.collectionName);
                });
                socket.on('error', function () {
                    console.log("error " + self.collectionName);
                });
                socket.on('reconnecting', function () {
                    console.log("reconnecting " + self.collectionName);
                });
                socket.on('reconnect', function () {
                    console.log("reconnect " + self.collectionName);
                });
                console.log("connect to " + self.collectionName);
                var insertOrUpdateDoc = function(doc) {
                    console.log('insert/update io ');
                    console.log(doc);
                    if (_.isArray(doc)) {
                        _.each(doc, insertOrUpdateDoc);
                        return;
                    }
                    var model = self.get(doc.id);
                    if (!model) {
                        var model = new self.model(doc);
                        self.add(model);
                    } else {
                        model.set(doc, {
                            silent: true
                        });
                        if(doc.lastAt) {
                            self.sort();
                        }
                        model.renderViews();
                    }
                };
                socket.on("insertedIo", function(doc) {
                    insertOrUpdateDoc(doc);
                    self.count++;
                    self.trigger("count", self.count);
                });
                socket.on("updatedIo", function(doc) {
                    insertOrUpdateDoc(doc);
                });
                socket.on("deletedIo", function(id) {
                    console.log('remove io '+id);
                    self.remove(id);
                    self.count--;
                    self.trigger("count", self.count);
                });
                self.initialized = true;
                self.trigger("initialized");
            });
        },
        headCount: function(callback) {
            var self = this;
            var aj = $.ajax({
                type: "HEAD",
                url: self.url,
                data: {},
                success: function(json) {
                    callback(aj.getResponseHeader("X-Count"));
                },
                xhrFields: {
                    withCredentials: true
                }
            });
        },
        refreshCount: function() {
            var self = this;
            self.headCount(function(count) {
                self.count = count;
                self.trigger("count", count);
            });
        },
        load: function(options, success) {
            var self = this;
            if (!this.count) {
                this.refreshCount();
            }
            if (!options) {
                options = {};
            }
            if (!options.limit) {
                options.limit = self.pageSize;
            }
            if (!options.sort) {
                //options.sort = "_id-";
            }
            this.applyFilters(options);
            this.fetch({
                data: options,
                add: true,
                success: function(collection, response) {
                    if (success) {
                        success();
                    }
                },
                error: function(collection, response) {}
            });
        },
        getNextPage: function(callback) {
            if (this.length < this.count) {
                this.load({
                    skip: this.length
                }, callback);
            }
        },
        applyFilters: function(options) {},
        updateFilter: function(filter) {
            this.reset();
            this.load();
        },
        comparator: function(doc) {
            var d;
            if (doc.get("time")) {
                d = (new Date(doc.get("time"))).getTime();
                return d * -1;
            } else {
                return 1;
            }
        },
        resetFilters: function() {},
        getOrFetch: function(id, callback) {
            var self = this;
            var doc;
            doc = this.get(id);
            if (doc) {
                callback(doc);
            } else {
                var options = {
                    _id: id
                };
                this.fetch({
                    data: options,
                    add: true,
                    success: function(collection, response) {
                        if (response) {
                            doc = self.get(id);
                            callback(doc);
                        } else {
                            callback(false);
                        }
                    },
                    error: function(collection, response) {
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
                this.view = new ListView(options);
                this.view.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.view;
        }
    });
    var ListView = Backbone.View.extend({
        layout: "row",
        initialize: function() {
            var self = this;
            self.loading = false;
            this.$pager = $('<div class="list-pager">showing <span class="list-length"></span> of <span class="list-count"></span> live sessions</div>');
            var $ul = this.$ul = $('<ul class="io-sessions"></ul>');
            this.collection.on("add", function(doc) {
                var view;
                if (self.layout === "row") {
                    view = doc.getRow({
                        list: self
                    });
                } else if (self.layout === "avatar") {
                    view = doc.getAvatar({
                        list: self
                    });
                }
                self.appendRow(view);
                self.renderPager();
                doc.on("remove", function() {
                    view.$el.remove();
                    return false;
                });
            });
            this.collection.on("remove", function(doc, col, options) {
                self.renderPager();
            });
            this.collection.on("count", function() {
                self.renderPager();
            });
            this.collection.on("reset", function() {
                self.render();
            });
            $(window).scroll(function() {
                if (self.$el.is(":visible")) {
                    if (!self.loading && $(window).scrollTop() + 250 >= $(document).height() - $(window).height()) {
                        self.loading = true;
                        self.loadMore();
                    }
                }
            });
        },
        filter: function(f) {
            var self = this;
            if (f && typeof f == "function") {
                this.currentFilter = f;
                this.collection.filter(function(model) {
                    if (f(model)) {
                        self.getDocLayoutView(model).$el.show();
                        return true;
                    }
                    self.getDocLayoutView(model).$el.hide();
                    return false;
                });
            } else {
                self.$ul.children().show();
                self.currentFilter = false;
            }
        },
        events: {
            "click .list-pager": "loadMore"
        },
        loadMore: function() {
            var self = this;
            this.collection.getNextPage(function() {
                self.loading = false;
            });
        },
        getDocLayoutView: function(doc) {
            var view;
            if (this.layout === "row") {
                view = doc.getRow({
                    list: self
                });
            } else if (this.layout === "avatar") {
                view = doc.getAvatar({
                    list: self
                });
            }
            return view;
        },
        render: function() {
            var self = this;
            this.$el.html("");
            this.$el.append(this.$ul);
            this.$ul.html("");
            this.collection.each(function(doc) {
                var view = self.getDocLayoutView(doc);
                self.appendRow(view);
            });
            this.$el.append(this.$pager);
            this.renderPager();
            this.setElement(this.$el);
            return this;
        },
        renderPager: function() {
            var len = this.collection.length;
            var c = this.collection.count > len ? this.collection.count : len;
            this.$pager.find(".list-length").html(len);
            this.$pager.find(".list-count").html(c);
        },
        appendRow: function(row) {
            var rank = new Date(row.model.get("lastAt"));
            rank = rank.getTime();
            var rowEl = row.render().$el;
            if (this.currentFilter && !this.currentFilter(row.model)) {
                rowEl.hide();
            }
            rowEl.attr("data-sort-rank", rank);
            var d = false;
            var $lis = this.$ul.children();
            var last = $lis.last();
            var lastRank = parseInt(last.attr("data-sort-rank"), 10);
            if (rank > lastRank) {
                $lis.each(function(i, e) {
                    if (d) return;
                    var r = parseInt($(e).attr("data-sort-rank"), 10);
                    if (rank > r) {
                        $(e).before(rowEl);
                        d = true;
                    }
                });
            }
            if (!d) {
                this.$ul.append(rowEl);
            }
        }
    });
    var ActionsView = Backbone.View.extend({
        tagName: "span",
        className: "actions",
        render: function() {
            var self = this;
            this.$el.html("");
            self.$el.append(this.editView.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            this.actions = [];
            this.editView = new ActionEditView({
                id: this.id,
                model: this.model
            });
        }
    });
    var ActionFeedView = Backbone.View.extend({
        tagName: "span",
        className: "feed",
        render: function() {
            if (!this.model.has("feed")) {
                this.$el.html('<button class="publish">publish to feed</button>');
            } else {
                var feed = this.model.get("feed");
                this.$el.html('published at <a href="/feed/item/' + feed.id + '" target="_new">' + feed.at + '</a><button class="unpublish">remove from feed</button>');
            }
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {},
        events: {
            "click .publish": "publish",
            "click .unpublish": "unpublish"
        },
        publish: function() {
            var self = this;
            console.log(this.model);
            this.model.set({
                feed: 0
            }, {
                silent: true
            });
            var saveModel = this.model.save(null, {
                silent: false,
                wait: true
            });
            saveModel.done(function() {
                self.render();
            });
            return false;
        },
        unpublish: function() {
            var self = this;
            console.log(this.model);
            this.model.unset("feed", {
                silent: true
            });
            var saveModel = this.model.save(null, {
                silent: false,
                wait: true
            });
            saveModel.done(function() {
                self.render();
            });
            return false;
        }
    });
    var ActionDeleteView = Backbone.View.extend({
        tagName: "span",
        className: "delete",
        render: function() {
            this.$el.html("<button>delete</button>");
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {},
        events: {
            "click button": "select"
        },
        select: function() {
            var self = this;
            if (confirm("Are you sure that you want to delete this post?")) {
                this.model.destroy({
                    success: function(model, response) {
                        window.history.back(-1);
                    },
                    errorr: function(model, response) {
                        console.log(arguments);
                    },
                    wait: true
                });
            }
            return false;
        }
    });
    var ActionEditView = Backbone.View.extend({
        tagName: "span",
        className: "edit",
        render: function() {
            this.$el.html("<button>edit</button>");
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {},
        events: {
            "click button": "select"
        },
        select: function() {
            var self = this;
            this.model.collection.trigger("editModel", this.model);
            return false;
        }
    });
    var TagsView = Backbone.View.extend({
        tagName: "span",
        className: "tags",
        render: function() {
            this.$el.html("");
            var tags = this.model.get("tags");
            if (tags) {
                for (var i in tags) {
                    var tagName = tags[i];
                    if (!_.isString(tagName)) {
                        var $btn = $('<button class="tag">' + tagName + "</button>");
                        $btn.attr("data-tag", JSON.stringify(tagName));
                        this.$el.append($btn);
                    } else {
                        this.$el.append('<button class="tag">' + tagName + "</button>");
                    }
                }
            }
            this.$el.append('<button class="newTag">+ tag</button>');
            this.$el.removeAttr("id");
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {},
        events: {
            "click .newTag": "newTag",
            "click .tag": "removeTag"
        },
        removeTag: function(e) {
            var self = this;
            if (confirm("Are you sure that you want to remove this tag?")) {
                var tags = this.model.get("tags");
                var $tag = $(e.target);
                var tagName = "";
                if ($tag.attr("data-tag")) {
                    tagName = JSON.parse($tag.attr("data-tag"));
                } else {
                    tagName = e.target.innerHTML;
                }
                this.model.pull({
                    tags: tagName
                }, {
                    silent: true
                });
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
            if (tagName) {
                tagName = tagName.split(",");
                for (var i in tagName) {
                    var tag = tagName[i];
                    tagName[i] = tag.trim();
                }
                if (tagName) {
                    if (!this.model.has("tags")) {
                        this.model.set({
                            tags: tagName
                        }, {
                            silent: true
                        });
                        var saveModel = this.model.save(null, {
                            silent: false,
                            wait: true
                        });
                        saveModel.done(function() {
                            console.log("tags saved");
                        });
                    } else {
                        this.model.pushAll({
                            tags: tagName
                        }, {
                            silent: true
                        });
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
    var GroupsView = Backbone.View.extend({
        tagName: "span",
        className: "groups",
        initialize: function() {},
        render: function() {
            this.$el.html("");
            var groups = this.model.get("groups");
            if (groups) {
                for (var i in groups) {
                    var groupName = groups[i];
                    this.$el.append('<button class="group">' + groupName + "</button>");
                }
                if (groups.indexOf("public") === -1) {
                    this.$el.append('<button class="publicGroup">+ public</button>');
                }
                if (groups && groups.length > 0) {
                    this.$el.append('<button class="privateGroup">+ private</button>');
                }
            }
            this.$el.append('<button class="newGroup">+ group</button>');
            this.$el.removeAttr("id");
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
            if (confirm("Are you sure that you want to make this private?")) {
                this.model.set({
                    groups: []
                }, {
                    silent: true
                });
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
            if (confirm("Are you sure that you want to make this public?")) {
                this.model.push({
                    groups: "public"
                }, {
                    silent: true
                });
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
            if (confirm("Are you sure that you want to remove this group?")) {
                var groups = this.model.get("groups");
                var name = e.target.innerHTML;
                this.model.pull({
                    groups: name
                }, {
                    silent: true
                });
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
            if (groupName) {
                groupName = groupName.split(",");
                for (var i in groupName) {
                    var g = groupName[i];
                    groupName[i] = g.trim();
                }
                if (groupName) {
                    if (!this.model.get("groups")) {
                        this.model.set({
                            groups: groupName
                        }, {
                            silent: true
                        });
                    } else {
                        this.model.pushAll({
                            groups: groupName
                        }, {
                            silent: true
                        });
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
        }
    });
    var RowView = Backbone.View.extend({
        tagName: "li",
        className: "row",
        initialize: function(options) {
            if (options.list) {
                this.list = options.list;
            }
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
            this.$el.attr("data-id", this.model.get("id"));
        },
        render: function() {
            this.$el.html("");
            var $byline = $('<span class="byline"></span>');
            if (this.model.has("agent") && this.model.get('headers')["user-agent"]) {
                var str = this.model.get('headers')["user-agent"];
                var $ua = $('<userAgent><span class="string">' + str + '</span><span class="os"></span><span class="browser"></span></userAgent>');
                if (this.model.has("agent")) {
                    var $os = $ua.find('.os');
                    var $browser = $ua.find('.browser');
                    var agent = this.model.get('agent');
                    $os.addClass(agent.os.replace(/\s/g, ''));
                    $os.html(agent.os);
                    $os.attr('title', agent.os);
                    $browser.addClass(agent.family.replace(/\s/g, ''));
                    $browser.html(agent.family);
                    $browser.attr('title', agent.family + ' ' + agent.major);
                }
                this.$el.append($ua);
            }
            var session = this.model.get("session");
            var $name = $('<strong class="name">' + session.name + "</strong>");
            this.$el.append($name);
            if (session.user) {
                $name.attr("data-owner-id", session.user);
                var owner = this.model.getOwner(function(owner) {
                    if (owner) {
                        $name.html("");
                        var ownerAvatarName = owner.getNewAvatarNameView();
                        ownerAvatarName.on("goToProfile", function(user) {
                            self.trigger("goToProfile", user);
                        });
                        $name.append(ownerAvatarName.render().$el);
                    }
                });
            }
            if (this.model.has("host")) {
                this.$el.append('<host><span class="ip">' + this.model.get("host").ip + "</span></host>");
                if(this.model.get("host").name) {
                    this.$el.find('host').append('<span class="name">' + this.model.get("host").name + "</span>");
                }
            }
            if (this.model.has("referer")) {
                this.$el.append('<referer>' + this.model.get("referer") + "</referer>");
            }
            if (this.model.has("sid")) {
                //this.$el.append('<span class="sid">' + this.model.get("sid") + "</span>");
            }
            if (this.model.has("rooms")) {
                var $rooms = $('<span class="rooms"></span>');
                var roomPrefix = "/socket.io/io/";
                for(var i in this.model.get("rooms")) {
                    if(i.indexOf(roomPrefix) !== -1) {
                        $rooms.append('<span class="room">'+i.substr(roomPrefix.length)+'</span>');
                    }
                }
                this.$el.append($rooms);
                //this.$el.append('<span class="sid">' + this.model.get("sid") + "</span>");
            }
            if (this.model.has("time")) {
                var $at = $('<span class="at"></span>');
                if (window.hasOwnProperty("clock")) {
                    $at.attr("title", clock.moment(this.model.get("time")).format("LLLL"));
                    $at.html(clock.moment(this.model.get("time")).calendar());
                } else {
                    $at.html(this.model.get("time"));
                }
                this.$el.append($at);
            }
            this.$el.append($byline);
            this.setElement(this.$el);
            return this;
        },
        events: {
            click: "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass("selected");
                el.siblings().removeAttr("selected");
            };
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            if (this.hasOwnProperty("list")) {
                this.list.trigger("select", this);
            }
            this.trigger("select");
            this.trigger("resize");
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    var FullView = Backbone.View.extend({
        tagName: "div",
        className: "fullView",
        initialize: function(options) {
            var self = this;
            if (options.list) {
                this.list = options.list;
            }
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
            this.actions = new ActionsView({
                id: this.id,
                model: this.model
            });
        },
        render: function() {
            var self = this;
            this.$el.html("");
            var $byline = $("<span></span>");
            if (this.model.has("title")) {
                this.$el.append('<h1 class="title">' + this.model.get("title") + "</h1>");
            }
            if (this.model.has("owner")) {
                $byline.append(' <i>by</i> <span class="owner">' + this.model.get("owner").name + "</span>");
                $byline.attr("data-owner-id", this.model.get("owner").id);
                var owner = this.model.getOwner(function(owner) {
                    if (owner) {
                        $byline.find(".owner").html("");
                        var ownerAvatarName = owner.getAvatarNameView();
                        ownerAvatarName.on("goToProfile", function(user) {
                            self.trigger("goToProfile", user);
                        });
                        $byline.find(".owner").append(ownerAvatarName.render().$el);
                    }
                });
            }
            if (this.model.has("at")) {
                var $at = $('<span class="at"></span>');
                if (window.hasOwnProperty("clock")) {
                    $at.attr("title", clock.moment(this.model.get("at")).format("LLLL"));
                    $at.html(clock.moment(this.model.get("at")).calendar());
                } else {
                    $at.html(this.model.get("at"));
                }
                $byline.append(" ");
                $byline.append($at);
            }
            if (this.model.has("msg")) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get("msg"));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            if (window.account && (account.isAdmin() || account.isOwner(this.model.get("owner").id))) {
                this.$el.append(this.actions.render().$el);
            }
            this.trigger("resize");
            this.setElement(this.$el);
            return this;
        },
        renderActions: function() {
            this.actions.render();
        },
        show: function() {
            this.$el.show();
        },
        events: {},
        remove: function() {
            $(this.el).remove();
        }
    });
    window.nl2br = function(str) {
        return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, "$1" + "<br />");
    };
    var AvatarView = Backbone.View.extend({
        tagName: "span",
        className: "avatar",
        render: function() {
            this.$el.html("");
            var $byline = $('<span class="byline"></span>');
            if (this.model.has("title")) {
                this.$el.append('<strong class="title">' + this.model.get("title") + "</strong>");
            }
            if (this.model.has("at")) {
                var $at = $('<span class="at"></span>');
                if (window.hasOwnProperty("clock")) {
                    $at.attr("title", clock.moment(this.model.get("at")).format("LLLL"));
                    $at.html(clock.moment(this.model.get("at")).calendar());
                } else {
                    $at.html(this.model.get("at"));
                }
                $byline.append($at);
            }
            if (this.model.has("owner")) {
                $byline.append(" by " + this.model.get("owner").name);
            }
            if (this.model.has("msg")) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get("msg"));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            this.$el.attr("data-id", this.model.get("_id"));
            this.setElement(this.$el);
            return this;
        },
        initialize: function(options) {
            if (options.list) {
                this.list = options.list;
            }
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
        },
        events: {
            click: "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass("selected");
                el.siblings().removeAttr("selected");
            };
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            if (this.hasOwnProperty("list")) {
                this.list.trigger("select", this);
            }
            this.trigger("select");
            this.trigger("resize");
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    var SelectGroupsView = Backbone.View.extend({
        tagName: "select",
        className: "groups",
        initialize: function() {
            this.$options = $('<option value="public">public</option><option value="private">private</option>');
        },
        render: function() {
            var self = this;
            this.$el.attr("name", "groups");
            this.$el.append(this.$options);
            if (this.model && this.model.has("groups") && this.model.get("groups").indexOf("public") !== -1) {
                this.$el.val("public");
            } else {
                console.log("rpv");
                this.$el.val("private");
                this.$options.find('option[value="private"]').attr("selected", "selected");
            }
            this.setElement(this.$el);
            return this;
        },
        val: function() {
            var groups = [];
            if (this.$el.find("input").val() == "public") {
                groups = [ "public" ];
            }
            return groups;
        },
        events: {}
    });
    var FormView = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            this.$owner = $("");
            if (this.model && this.model.id) {
                this.$el.attr("data-id", this.model.id);
                this.$owner = $("" + this.model.get("owner").name);
            } else {
                if (!this.model) {
                    this.model = new Model({}, {
                        collection: this.collection
                    });
                } else {}
            }
            this.$inputTitle = $('<input type="text" name="title" placeholder="Title of your post" autocomplete="off" />');
            this.$inputAtDate = $('<input name="at-date" type="date"/>');
            this.$inputAtTime = $('<input type="time"/>');
            this.atPublished = $('<span class="published"><span class="by">by <span class="owner"></span></span><br /><span class="at">at </span></span>');
            this.atPublished.find(".owner").append(this.$owner);
            this.atPublished.find(".at").append(this.$inputAtDate);
            this.atPublished.find(".at").append(this.$inputAtTime);
            this.inputGroupsView = new SelectGroupsView({
                model: this.model
            });
            this.feedView = new ActionFeedView({
                model: this.model
            });
            this.deleteView = new ActionDeleteView({
                model: this.model
            });
            this.$form = $('<form class="post"><fieldset></fieldset><controls></controls></form>');
            this.$form.find("fieldset").append(this.$inputTitle);
            this.$form.find("fieldset").append("<hr />");
            this.$form.find("fieldset").append(this.atPublished);
            this.$form.find("fieldset").append(this.deleteView.render().$el);
            this.$form.find("controls").append(this.inputGroupsView.render().$el);
            this.$form.find("controls").append('<input type="submit" value="POST" />');
        },
        render: function() {
            var self = this;
            if (this.$el.find("form").length === 0) {
                console.log("append form");
                this.$el.append(this.$form);
            }
            if (this.model) {
                if (this.model.has("title")) {
                    this.$inputTitle.val(this.model.get("title"));
                }
                if (this.model.has("at")) {
                    this.$inputAtDate.val(this.model.get("at").substr(0, 10));
                    this.$inputAtTime.val(this.model.get("at").substr(11, 5));
                }
                if (this.model.has("user")) {
                    this.model.getOwner(function(owner) {
                        if (owner) {
                            self.$owner.html(owner.getAvatarNameView().render().$el);
                        }
                    });
                }
            }
            this.setElement(this.$el);
            return this;
        },
        events: {
            "submit form": "submit",
            'keyup input[name="title"]': "throttleTitle",
            'blur input[name="title"]': "blurTitle"
        },
        blurTitle: function() {
            console.log("blur title");
            var titleStr = this.$inputTitle.val().trim();
            if (titleStr != "") {}
        },
        throttleTitle: _.debounce(function() {
            this.refreshTitle.call(this, arguments);
        }, 300),
        refreshTitle: function(e) {
            var titleStr = this.$inputTitle.val().trim();
            this.trigger("title", titleStr);
            if (!this.model.has("slug") || this.model.isNew()) {
                this.$inputSlug.val(this.model.slugStr(titleStr));
            }
        },
        submit: function() {
            var self = this;
            var setDoc = {};
            var title = this.$inputTitle.val();
            var msg = this.$inputMsg.val();
            var slug = this.$inputSlug.val();
            var groups = this.inputGroupsView.val();
            if (title !== "" && title !== this.model.get("title")) {
                setDoc.title = title;
            }
            if (msg !== "" && msg !== this.model.get("msg")) {
                setDoc.msg = msg;
            }
            if (slug !== "" && slug !== this.model.get("slug")) {
                setDoc.slug = slug;
            }
            if (groups.length > 0 && groups !== this.model.get("groups")) {
                setDoc.groups = groups;
            }
            console.log("setDoc");
            console.log(setDoc);
            this.model.set(setDoc, {
                silent: true
            });
            var saveModel = this.model.save(null, {
                silent: false,
                wait: true
            });
            if (saveModel) {
                saveModel.done(function() {
                    self.trigger("saved", self.model);
                    self.collection.add(self.model);
                });
            } else {
                self.trigger("saved", self.model);
            }
            return false;
        },
        focus: function() {
            this.$inputTitle.focus();
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    if (define) {
        define(function() {
            return {
                Collection: Collection,
                Model: Model,
                List: ListView,
                Row: RowView,
                Avatar: AvatarView,
                Full: FullView,
                Form: FormView
            };
        });
    }
})();