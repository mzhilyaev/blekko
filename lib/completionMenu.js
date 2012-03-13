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

Cu.import("resource://gre/modules/Services.jsm", this);


function dump(  str ) {  console.log( str ); }

// configObject 
//{
//  window: window ,
//  onItemActivation: callback( { icon: v , url: u , completion: v } ) ,
//  onItemClick:  callback( { icon: v , url: u , completion: v } ) 
//  onMenuShow:  callback( )
//  onMenuHide:  callback( )
//}

function CompletionMenu( configObject ) {
try{
    let window = configObject.window;
    this.window = window;
    let { document, gBrowser} = window;
    let {change, createNode, listen, unload} = makeWindowHelpers(window);

	this.createNode = createNode;

    dump( "initializing menu" );
    let menu = createNode("menupopup");
    menu.setAttribute("ignorekeys", "true");
    document.getElementById("mainPopupSet").appendChild(menu);

    unload(function() {
      menu.parentNode.removeChild(menu);
    });

    this.generalSeparator = createNode("menuseparator");
    menu.appendChild(this.generalSeparator);

    this.contextSeparator = createNode("menuseparator");
    menu.appendChild(this.contextSeparator);

    this.contextItem = createNode("menuitem");
    this.contextItem.setAttribute("label", "Use current page for suggestions");
    this.contextItem.setAttribute("checked", "true");
    this.contextItem.setAttribute("type", "checkbox");
    menu.appendChild(this.contextItem);

    this.previewItem = createNode("menuitem");
    this.previewItem.setAttribute("label", "Preview highlighted terms");
    this.previewItem.setAttribute("checked", "true");
    this.previewItem.setAttribute("type", "checkbox");
    menu.appendChild(this.previewItem);

    this.menu = menu;
    this.generalItems = [];
    this.contextItems = [];

    this.activeItem = null;
	this.onItemClick = configObject.onItemClick;

	dump( this.onItemClick );

    // add listerners
    menu.addEventListener("DOMAttrModified", function({attrName, target}) {
      if (attrName != "_moz-menuactive")
        return;

      // Track the newly activated item
      if (target.hasAttribute("_moz-menuactive")) {
        // Mouse event activated a different target, so clear the previous item
        if (this.activeItem != null && this.activeItem != target) {
          this.activeItem.removeAttribute("_moz-menuactive");
        }
        this.activeItem = target;


		// do a bit of delay to stop flurry of page loads in preview
		this.window.setTimeout(  function( ) {
		    // make sure the target is still selected
		    if( target.hasAttribute("_moz-menuactive") ) {
			   dump( "activating " + target.getAttribute("label") );
               configObject.onItemActivation( this.getActiveItemData( ) );
			}
   		   }.bind( this )  , 150 );
      }
      // Item is deactivating, so untrack if it's the one
      else if (target == this.activeItem) {
        this.activeItem = null;
      }
    }.bind( this ));

    if( configObject.onMenuHide ) {
		menu.addEventListener("popuphidden", function( ) { configObject.onMenuHide( ); } );
    }

    if( configObject.onMenuShow ) {
		menu.addEventListener("popupshown", function( ) { configObject.onMenuShow( ); } );
    }
} catch ( ex ) {
	dump( "ERROR " + ex );
}
}

CompletionMenu.prototype = {

      addItems: function(results, items, separator) {
        // Show/hide the separator below the items as necessary
        if (results.length == 0) {
          separator.setAttribute("hidden", "true");
        }
        else {
          separator.removeAttribute("hidden");
        }

        // Create menu items to insert into the list
        results.forEach(function({completion, icon, target}, index) {
          let item = items[index]
          if (item == null) {
            item = this.createNode("menuitem");
            item.setAttribute("class", "menuitem-iconic");
            this.menu.insertBefore(item, separator);
            items.push(item);

          }

          item.setAttribute("image", icon);
          item.setAttribute("label", completion);
          item.setAttribute("url", target);
          item.removeAttribute("hidden");
		  item.addEventListener("click", function( event ) { 
				if( this.onItemClick ) {
					dump( event.target );
					this.onItemClick( this.getItemData( event.target ) );
				}
		  	}.bind( this ));
        }.bind( this ));

        // Hide any unused items
        for (let i = results.length; i < items.length; i++) {
          items[i].setAttribute("hidden", "true");
        }
      },

	  itemClicked: function( ) {
	  	if( this.onItemClick && this.activeItem ) {
			this.onItemClick( this.getActiveItemData( ) );
		}
	  },

      addGeneralItems: function(results) {  
			this.addItems( results , this.generalItems , this.generalSeparator ); 
      } ,
      addContextItems: function(results) {  
			this.addItems( results , this.contextItems , this.contextSeparator ); 
      } ,

      selectFirst:  function( ) {
        let first = this.generalItems[0];
        if (first == null || first.hidden) {
          first = this.contextItems[0];
        }
        if (first != null && !first.hidden) {
          first.setAttribute("_moz-menuactive", "true");
        }
      },

    // Handle menu items getting activated
    moveDown: function( ) {
	    dump( "moving down");
        let next = this.activeItem == null ? this.menu.firstChild : this.activeItem.nextSibling;
        while (next != null && (next.hidden || next.nodeName != "menuitem")) {
          next = next.nextSibling;
        }
        if (next != null) {
          next.setAttribute("_moz-menuactive", "true");
        }
        else if (activeItem != null) {
          this.activeItem.removeAttribute("_moz-menuactive");
        }
    },

    moveUp: function( ) {
        let prev = this.activeItem == null ? this.menu.lastChild : this.activeItem.previousSibling;
        while (prev != null && prev.nodeName != "menuitem") {
          prev = prev.previousSibling;
        }
        if (prev != null) {
          prev.setAttribute("_moz-menuactive", "true");
        }
        else if (activeItem != null) {
          this.activeItem.removeAttribute("_moz-menuactive");
        }
    },

    tabTrough: function( ) {
    
        if (this.activeItem == null) {
          this.menu.firstChild.setAttribute("_moz-menuactive", "true");
        }
        else if (this.contextItems[0] != null && !this.contextItems[0].hidden) {
          if (this.contextItems[0].compareDocumentPosition(this.activeItem) == 2) {
            this.contextItems[0].setAttribute("_moz-menuactive", "true");
          }
          else {
            this.generalItems[0].setAttribute("_moz-menuactive", "true");
          }
        }
    },

    getItemData: function( item ) {
		return {
                url: item.getAttribute("url") ,
                completion: item.getAttribute("label") ,
                icon: item.getAttribute( "image") 
			   };
	},

    getActiveItemData: function( ) {

		if( this.activeItem ) return this.getItemData( this.activeItem );
        else	 			  return { url: null , completion: null , icon: null}
    },

    getActiveItemUrl: function( ) {
        if( this.activeItem ) return this.activeItem.getAttribute("url");
        return null;
    },


   isOpen:	function( ) { return this.menu.state != "closed"; },
   getState: function( ) { return this.menu.state; } ,
   doContextCompletions:  function( ) { return this.contextItem.hasAttribute("checked"); } ,
   doPreview:  function( ) { return this.previewItem.hasAttribute("checked"); },

   show: function( where , how ) {  this.menu.openPopup(where, how); },
   hide: function( ) { this.menu.hidePopup(); } ,
   hideContextCompletions: function( ) {
        this.contextItems.forEach(function(item) {
          item.setAttribute("hidden", "true");
        });
        this.contextSeparator.setAttribute("hidden", "true");
   }

}

exports.CompletionMenu = CompletionMenu;
