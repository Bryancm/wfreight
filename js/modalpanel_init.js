'use strict';

/**
 * modelpanel_init.js
 * 
 * Dependencies:
 *  jQuery
 *  jquery.modal2.js
 */

uship.ns('modalpanel', function (ns) {
  ns.init = function (parent) {
    return jQuery(parent || document.body).find('.modalpanel').modal({
      containerSelector: '.modalpanel-container',
      closeSelector: '.modalpanel-close'
    });
  };
});

jQuery(function () {
  uship.ns.modalpanel.init();
});