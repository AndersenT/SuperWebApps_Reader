
// Create or open the data store where objects are stored for offline use
var store = new Lawnchair({name: 'entries', record: 'entry'}, function() {});


// Create the all up Ember application
var SuperWebApp_Reader = Em.Application.create({
  ready: function() {
    // Call the superclass's `ready` method.
    this._super();

    SuperWebApp_Reader.GetItemsFromDataStore();
    document.addEventListener('keydown', handleBodyKeyDown, false);
  }
});

// Ember Object model for entry items
SuperWebApp_Reader.Item = Em.Object.extend({
  //TODO:

  read: false,
  starred: false,
  item_id: null,
  title: null,
  pub_name: null,
  pub_author: null,
  pub_date: new Date(0),
  short_desc: null,
  content: null,
  feed_link: null,
  item_link: null
});

SuperWebApp_Reader.GetItemsFromDataStore = function() {
  // Get all items from the local data store.
  //  We're using store.all because store.each returns async, and the
  //  method will return before we've pulled all the items out.  Then
  //  there is a strong likelyhood of GetItemsFromServer stomping on
  //  local items.
  var items = store.all(function(arr) {
    arr.forEach( function(entry) {
      var item = SuperWebApp_Reader.Item.create(entry);
      SuperWebApp_Reader.dataController.addItem(item);
    });
    console.log("Entries loaded from local data store:", arr.length);

    // Set the default view to any unread items
    SuperWebApp_Reader.itemsController.showDefault();

    // Load items from the server after we've loaded everything from
    //  the local data store
    SuperWebApp_Reader.GetItemsFromServer();
  });
};

SuperWebApp_Reader.GetItemsFromServer = function() {
  $(".icon-refresh").addClass("spin");
  // URL to data feed that I plan to consume
  var feed = "http://blog.chromium.org/feeds/posts/default?alt=rss";
  feed = encodeURIComponent(feed);

  // Feed parser that supports CORS and returns data as a JSON string
  var feedPipeURL = "http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20xml%20where%20url%3D'";
  feedPipeURL += feed + "'&format=json";

  console.log("Starting AJAX Request:", feedPipeURL);

  $.ajax({
    url: feedPipeURL,
    dataType: 'json',
    complete: function() {
      $(".icon-refresh").removeClass("spin");
    },
    success: function(data) {
      // Get the items object from the result
      var items = data.query.results.rss.channel.item;

      // Get the original feed URL from the result
      var feedLink = data.query.results.rss.channel.link;

      // Use map to iterate through the items and create a new JSON object for
      //  each item
      items.map(function(entry) {
        var item = {};
        // Set the item ID to the item GUID
        item.item_id = entry.guid.content;
        // Set the publication name to the RSS Feed Title
        item.pub_name = data.query.results.rss.channel.title;
        item.pub_author = entry.author;
        item.title = entry.title;
        // Set the link to the entry to it's original source if it exists
        //  or set it to the entry link
        if (entry.origLink) {
          item.item_link = entry.origLink;
        } else if (entry.link) {
          item.item_link = entry.link;
        }
        item.feed_link = feedLink;
        // Set the content of the entry
        item.content = entry.description;
        // Ensure the summary is less than 128 characters
        if (entry.description) {
          item.short_desc = entry.description.substr(0, 128) + "...";
        }
        // Create a new date object with the entry publication date
        item.pub_date = new Date(entry.pubDate);
        item.read = false;
        // Set the item key to the item_id/GUID
        item.key = item.item_id;
        // Create the Ember object based on the JavaScript object
        var emItem = SuperWebApp_Reader.Item.create(item);
        // Try to add the item to the data controller, if it's successfully
        //  added, we get TRUE and add the item to the local data store,
        //  otherwise it's likely already in the local data store.
        if (SuperWebApp_Reader.dataController.addItem(emItem)) {
          store.save(item);
        }
      });

      // Refresh the visible items
      SuperWebApp_Reader.itemsController.showDefault();
    }
  });
};

SuperWebApp_Reader.dataController = Em.ArrayController.create({
  // content array for Ember's data
  content: [],

  // Adds an item to the controller if it's not already in the controller
  addItem: function(item) {
    // Check to see if there are any items in the controller with the same
    //  item_id already
    var exists = this.filterProperty('item_id', item.item_id).length;
    if (exists === 0) {
      // If no results are returned, we insert the new item into the data
      // controller in order of publication date
      var length = this.get('length'), idx;
      idx = this.binarySearch(Date.parse(item.get('pub_date')), 0, length);
      this.insertAt(idx, item);
      return true;
    } else {
      // It's already in the data controller, so we won't re-add it.
      return false;
    }
  },

  // Binary search implementation that finds the index where a entry
  // should be inserted when sorting by date.
  binarySearch: function(value, low, high) {
    var mid, midValue;
    if (low === high) {
      return low;
    }
    mid = low + Math.floor((high - low) / 2);
    midValue = Date.parse(this.objectAt(mid).get('pub_date'));

    if (value < midValue) {
      return this.binarySearch(value, mid + 1, high);
    } else if (value > midValue) {
      return this.binarySearch(value, low, mid);
    }
    return mid;
  },

  // A 'property' that returns the count of items
  itemCount: function() {
    return this.get('length');
  }.property('@each'),

  // A 'property' that returns the count of read items
  readCount: function() {
    return this.filterProperty('read', true).get('length');
  }.property('@each.read'),

  // A 'property' that returns the count of unread items
  unreadCount: function() {
    return this.filterProperty('read', false).get('length');
  }.property('@each.read'),

  // A 'property' that returns the count of starred items
  starredCount: function() {
    return this.filterProperty('starred', true).get('length');
  }.property('@each.starred')
});

// Visible Item Controller - we never really edit any of the content
//  in here, it's solely used to decide what we're showing, pulling from
//  the data controller.
SuperWebApp_Reader.itemsController = Em.ArrayController.create({
  // content array for Ember's data
  content: [],

  // Sets content[] to the filtered results of the data controller
  filterBy: function(key, value) {
    this.set('content', SuperWebApp_Reader.dataController.filterProperty(key, value));
  },

  // Sets content[] to all items in the data controller
  clearFilter: function() {
    this.set('content', SuperWebApp_Reader.dataController.get('content'));
  },

  // Shortcut for filterBy
  showDefault: function() {
    this.filterBy('read', false);
  },

  // Mark all visible items read
  markAllRead: function() {
    // Iterate through all items, and set read=true in the item controller
    this.forEach(function(item) {
      item.set('read', true);
    });
  },

  // A 'property' that returns the count of visible items
  itemCount: function() {
    return this.get('length');
  }.property('@each'),

  // A 'property' that returns the count of read items
  readCount: function() {
    return this.filterProperty('read', true).get('length');
  }.property('@each.read'),

  // A 'property' that returns the count of unread items
  unreadCount: function() {
    return this.filterProperty('read', false).get('length');
  }.property('@each.read'),

  // A 'property' that returns the count of starred items
  starredCount: function() {
    return this.filterProperty('starred', true).get('length');
  }.property('@each.starred')

});

// Selected Item Controller - and provides functionality to hook into
// all details for a specific item.
SuperWebApp_Reader.selectedItemController = Em.Object.create({
  // Pointer to the seclected item
  selectedItem: null,

  hasPrev: false,

  hasNext: false,

  // Called to select an item
  select: function(item) {
    this.set('selectedItem', item);
    if (item) {
      this.toggleRead(true);

      // Determine if we have a previous/next item in the array
      var currentIndex = SuperWebApp_Reader.itemsController.content.indexOf(this.get('selectedItem'));
      if (currentIndex + 1 >= SuperWebApp_Reader.itemsController.get('itemCount')) {
        this.set('hasNext', false);
      } else {
        this.set('hasNext', true);
      }
      if (currentIndex === 0) {
        this.set('hasPrev', false);
      } else {
        this.set('hasPrev', true);
      }

    } else {
      this.set('hasPrev', false);
      this.set('hasNext', false);
    }
  },

  // Toggles or sets the read state with an optional boolean
  toggleRead: function(read) {
    if (read === undefined) {
      read = !this.selectedItem.get('read');
    }
    this.selectedItem.set('read', read);
    var key = this.selectedItem.get('item_id');
    store.get(key, function(entry) {
      entry.read = read;
      store.save(entry);
    });
  },

  // Toggles or sets the starred status with an optional boolean
  toggleStar: function(star) {
    if (star === undefined) {
      star = !this.selectedItem.get('starred');
    }
    this.selectedItem.set('starred', star);
    var key = this.selectedItem.get('item_id');
    store.get(key, function(entry) {
      entry.starred = star;
      store.save(entry);
    });
  },

  // Selects the next item in the item controller
  next: function() {
    // Get's the current index in case we've changed the list of items, if the
    // item is no longer visible, it will return -1.
    var currentIndex = SuperWebApp_Reader.itemsController.content.indexOf(this.get('selectedItem'));
    // Figure out the next item by adding 1, which will put it at the start
    // of the newly selected items if they've changed.
    var nextItem = SuperWebApp_Reader.itemsController.content[currentIndex + 1];
    if (nextItem) {
      this.select(nextItem);
    }
  },

  // Selects the previous item in the item controller
  prev: function() {
    // Get's the current index in case we've changed the list of items, if the
    // item is no longer visible, it will return -1.
    var currentIndex = SuperWebApp_Reader.itemsController.content.indexOf(this.get('selectedItem'));
    // Figure out the previous item by subtracting 1, which will result in an
    // item not found if we're already at 0
    var prevItem = SuperWebApp_Reader.itemsController.content[currentIndex - 1];
    if (prevItem) {
      this.select(prevItem);
    }
  }
});

// Top Menu/Nav Bar view
SuperWebApp_Reader.NavBarView = Em.View.extend({
  // A 'property' that returns the count of items
  itemCount: function() {
    return SuperWebApp_Reader.dataController.get('itemCount');
  }.property('SuperWebApp_Reader.dataController.itemCount'),

  // A 'property' that returns the count of unread items
  unreadCount: function() {
    return SuperWebApp_Reader.dataController.get('unreadCount');
  }.property('SuperWebApp_Reader.dataController.unreadCount'),

  // A 'property' that returns the count of starred items
  starredCount: function() {
    return SuperWebApp_Reader.dataController.get('starredCount');
  }.property('SuperWebApp_Reader.dataController.starredCount'),

  // A 'property' that returns the count of read items
  readCount: function() {
    return SuperWebApp_Reader.dataController.get('readCount');
  }.property('SuperWebApp_Reader.dataController.readCount'),

  // Click handler for menu bar
  showAll: function() {
    SuperWebApp_Reader.itemsController.clearFilter();
  },

  // Click handler for menu bar
  showUnread: function() {
    SuperWebApp_Reader.itemsController.filterBy('read', false);
  },

  // Click handler for menu bar
  showStarred: function() {
    SuperWebApp_Reader.itemsController.filterBy('starred', true);
  },

  // Click handler for menu bar
  showRead: function() {
    SuperWebApp_Reader.itemsController.filterBy('read', true);
  },

  // Click handler for menu bar
  refresh: function() {
    SuperWebApp_Reader.GetItemsFromServer();
  },

  showAbout: function() {
    $("#modalAbout").modal({"show":true});
  }
});

// View for the ItemsList
SuperWebApp_Reader.SummaryListView = Em.View.extend({
  //TODO:

  tagName: 'article',

  classNames: ['well', 'summary'],

  classNameBindings: ['read', 'starred', 'active'],

  touchEnd: function(evt) {
    this.click(evt);
  },

    // Handle clicks on an item summary
  click: function(evt) {
    // Figure out what the user just clicked on, then set selectedItemController
    var content = this.get('content');
    SuperWebApp_Reader.selectedItemController.select(content);
  },

  // Enables/Disables the read CSS class
  read: function() {
    var read = this.get('content').get('read');
    return read;
  }.property('SuperWebApp_Reader.itemsController.@each.read'),

  // Enables/Disables the read CSS class
  starred: function() {
    var starred = this.get('content').get('starred');
    return starred;
  }.property('SuperWebApp_Reader.itemsController.@each.starred'),

  // Returns the date in a human readable format
  formattedDate: function() {
    var d = this.get('content').get('pub_date');
    return moment(d).format('MMMM Do, YYYY');
  }.property('SuperWebApp_Reader.itemsController.@each.pub_date'),

  // Enables/Disables the active CSS class
  active: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    var content = this.get('content');
    if (content === selectedItem) {
      return true;
    }
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem')
});

// A special observer that will watch for when the 'selectedItem' is updated
// and ensure that we scroll into a view so that the selected item is visible
// in the summary list view.
SuperWebApp_Reader.selectedItemController.addObserver('selectedItem', function() {
  var curScrollPos = $('.summaries').scrollTop();
  var itemTop = $('.summary.active').offset().top - 60;
  $(".summaries").animate({"scrollTop": curScrollPos + itemTop}, 200);
});

// View for the Selected Item
SuperWebApp_Reader.EntryItemView = Em.View.extend({
  tagName: 'article',

  contentBinding: 'SuperWebApp_Reader.selectedItemController.selectedItem',

  classNames: ['well', 'entry'],

    // Enables/Disables the active CSS class
  active: function() {
    return true;
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem'),

  toggleRead: function() {
    SuperWebApp_Reader.selectedItemController.toggleRead();
  },

  toggleStar: function() {
    SuperWebApp_Reader.selectedItemController.toggleStar();
  },

  readButtonClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('read')) {
        return 'btn active';
      }
    }
    return 'btn';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.read'),

  starButtonClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('starred')) {
        return 'btn active';
      }
    }
    return 'btn';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.starred'),

  starClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('starred')) {
        return 'icon-star';
      }
    }
    return 'icon-star-empty';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.starred'),

  readClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('read')) {
        return 'icon-ok-sign';
      }
    }
    return 'icon-ok-circle';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.read'),

  // Returns a human readable date
  formattedDate: function() {
    var d = this.get('content').get('pub_date');
    return moment(d).format("MMMM Do YYYY, h:mm a");
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem')
});

// Left hand controls view
SuperWebApp_Reader.NavControlsView = Em.View.extend({
  tagName: 'section',

  classNames: ['controls'],

  // Click handler for up/previous button
  navUp: function(event) {
    SuperWebApp_Reader.selectedItemController.prev();
  },

  // Click handler for down/next button
  navDown: function(event) {
    SuperWebApp_Reader.selectedItemController.next();
  },

  // Click handler to toggle the selected items star status
  toggleStar: function(event) {
    SuperWebApp_Reader.selectedItemController.toggleStar();
  },

  // Click handler to toggle the selected items read status
  toggleRead: function(event) {
    SuperWebApp_Reader.selectedItemController.toggleRead();
  },

  // Click handler to mark all as read
  markAllRead: function(event) {
    SuperWebApp_Reader.itemsController.markAllRead();
  },

  // Click handler for refresh
  refresh: function(event) {
    SuperWebApp_Reader.GetItemsFromServer();
  },

  starClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('starred')) {
        return 'icon-star';
      }
    }
    return 'icon-star-empty';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.starred'),
  readClass: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      if (selectedItem.get('read')) {
        return 'icon-ok-sign';
      }
    }
    return 'icon-ok-circle';
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.read'),
  nextDisabled: function() {
    return !SuperWebApp_Reader.selectedItemController.get('hasNext');
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.next'),
  prevDisabled: function() {
    return !SuperWebApp_Reader.selectedItemController.get('hasPrev');
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem.prev'),
  buttonDisabled: function() {
    var selectedItem = SuperWebApp_Reader.selectedItemController.get('selectedItem');
    if (selectedItem) {
      return false;
    }
    return true;
  }.property('SuperWebApp_Reader.selectedItemController.selectedItem')
});

window.applicationCache.addEventListener('updateready', function(e) {
  if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
    $("#modalUpdate").modal({"show":true});
  }
}, false);

SuperWebApp_Reader.swapCache = function(value) {
  if (value === true) {
    window.applicationCache.swapCache();
    window.location.reload();
  } else {
    $("#modalUpdate").modal('hide');
  }
};


SuperWebApp_Reader.HandleSpaceKey = function() {
  var itemHeight = $('.entry.active').height() + 60;
  var winHeight = $(window).height();
  var curScroll = $('.entries').scrollTop();
  var scroll = curScroll + winHeight;
  if (scroll < itemHeight) {
    $('.entries').scrollTop(scroll);
  } else {
    SuperWebApp_Reader.selectedItemController.next();
  }
};

function handleBodyKeyDown(evt) {
  if (evt.srcElement.tagName === "BODY") {
    switch (evt.keyCode) {
      case 34: // PgDn
      case 39: // right arrow
      case 40: // down arrow
      case 74: // j
        SuperWebApp_Reader.selectedItemController.next();
        break;

      case 32: // Space
        SuperWebApp_Reader.HandleSpaceKey();
        evt.preventDefault();
        break;

      case 33: // PgUp
      case 37: // left arrow
      case 38: // up arrow
      case 75: // k
        SuperWebApp_Reader.selectedItemController.prev();
        break;

      case 85: // U
        SuperWebApp_Reader.selectedItemController.toggleRead();
        break;

      case 72: // H
        SuperWebApp_Reader.selectedItemController.toggleStar();
        break;
      }
    }
}
