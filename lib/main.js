/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Blekko.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2012
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const {Ci,Cu} = require("chrome");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {suggest} = require("suggest");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");
const {Preview} = require("preview");
const {CompletionMenu} = require("completionMenu");

Cu.import("resource://gre/modules/Services.jsm", this);

exports.main = function(options) {
try {
  // per-window initialization
  watchWindows(function(window) {
    let {change, createNode, listen, unload} = makeWindowHelpers(window);
    let {document, gBrowser} = window;
    let search = window.BrowserSearch.searchBar;

    unload(cleanUp);
    // Prepare the active previewBrowser, make sure that focus points back to
	// window.BrowserSearch.searchBar - so that the page loaded does not focus

    let previewBrowser = new Preview( window , function( event ) {
		search.focus();
        search._textbox.selectionStart = search._textbox.selectionEnd;
	});

    let menu = new CompletionMenu( 
	  {
	  	window: window,
		onItemActivation: function( itemData ) {
			previewBrowser.show( itemData.url );
	    },
		onMenuHide: function ( ) {
		    console.log("hiding preview");
			previewBrowser.cleanUp( );
		},
		onItemClick: function( itemData ) {
			slideIn( itemData );
		}
      });

    function slideIn( itemData ) {
        if (itemData.completion != null) {
          search.value = itemData.completion;
          previewBrowser.slideIn( itemData.url );
          menu.hide();
        }      
    }
					
	
    // Build the menu list for a query and context
    function buildList(query, tabContext) {
	 try{
	  console.log( "BUILDING LISTS");
      query = query.replace(/^\s+/, "");

      // Determine what context to use
      let queryContext = "";
      if ( menu.doContextCompletions( )) {
        try {
          let {currentURI} = tabContext.linkedBrowser;
          let domain = Services.eTLD.getBaseDomain(currentURI);
          queryContext = domain.match(/^[^.]+/)[0];
        }
        catch(ex) {}
      }

      // Immediately hide context items if they won't be used
      if (queryContext == "") {  
	  	menu.hideContextCompletions( ); 
      }

      // Get suggestions and add them to the menu
      suggest(query, queryContext, function({general, context}) {
        menu.addGeneralItems( general );
        menu.addContextItems( context );

        // Auto-select the first result if it's showing
		menu.selectFirst( );

		// pull the url from the menu
		let url = menu.getActiveItemUrl( );
		if( url ) {
        	previewBrowser.show( url );
		}
      });
	 }
	 catch( ex ) {  console.log( "ERROR" + ex ); }
    }

    // Handle keyboard navigation
    listen(search.parentNode, "keypress", function(event) {

      // Move down the list
      if (event.keyCode == event.DOM_VK_DOWN) {
	    menu.moveDown( );
        event.stopPropagation();
      }
      // Move up the list
      else if (event.keyCode == event.DOM_VK_UP) {
	    menu.moveUp( );
        event.stopPropagation();
      }
      // Skip to the next list
      else if (event.keyCode == event.DOM_VK_TAB) {
	    menu.tabTrough( );
        event.preventDefault();
      }
      // Trigger the selected item
      else if (event.keyCode == event.DOM_VK_RETURN) {
	    let itemData = menu.getActiveItemData( );
        slideIn( itemData );
        event.stopPropagation();
      }
      // Clean up on escape
      else if (event.keyCode == event.DOM_VK_ESCAPE) {
        // Dismiss the menu
        if ( ! menu.isOpen( ) ) {
          cleanUp();
        }
        // Clear the input
        else if (search.value != "") {
          search.value = "";
        }
        // Blur the search box
        else {
          gBrowser.selectedBrowser.focus();
        }
        event.stopPropagation();
      }
    });

    // Detect when to show suggestions
    listen(search, "input", function(event) {
      let {name} = Services.search.currentEngine;
	  	console.log( "checking stuff");
      // XXX steal inputs for everything for debugging
      if (true || name == "Blekko") {
	  	console.log( "luanching all");
        menu.show(search, "after_start");
        buildList(search.value, gBrowser.selectedTab);
        event.stopPropagation();
      }
    });

    // Hide suggestions and previews when closing tabs
    listen(gBrowser.tabContainer, "TabClose", function({target}) {
      cleanUp();
    });

    // Hide suggestions and previews when switching tabs
    listen(gBrowser.tabContainer, "TabSelect", function() {
      cleanUp();
    });

    function cleanUp() {
      menu.hide();
      gBrowser.selectedBrowser.style.opacity = "";
      previewBrowser.cleanUp( );
    }
  });
  console.log( "done with main");

}
catch ( ex ) {

	console.log( "ERROR" + ex );

}
}
