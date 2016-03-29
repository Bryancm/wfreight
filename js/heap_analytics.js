"use strict";

var HeapAnalytics = function HeapAnalytics(options) {
	var self = this;
	window.heap = window.heap || [], heap.load = function (t, e) {
		window.heap.appid = t, window.heap.config = e;var a = document.createElement("script");a.type = "text/javascript", a.async = !0, a.src = ("https:" === document.location.protocol ? "https:" : "http:") + "//cdn.heapanalytics.com/js/heap.js";var n = document.getElementsByTagName("script")[0];n.parentNode.insertBefore(a, n);for (var o = function o(t) {
			return function () {
				if (Object.prototype.toString.call(heap) !== '[object Array]') {
					var temp = heap;heap = [];for (var i in temp) {
						if (temp.hasOwnProperty(i)) {
							heap.push(temp[i]);
						}
					}
				}heap.push([t].concat(Array.prototype.slice.call(arguments, 0)));
			};
		}, p = ["identify", "track"], c = 0; c < p.length; c++) {
			heap[p[c]] = o(p[c]);
		}
	};
	self.heapProjectId = options.heapProjectId || 0;
	self.heapHandle = options.heapHandle || '';
	self.shipperType = options.shipperType;
	self.deferPageviewTracking = options.deferPageviewTracking || false;
	self.pageviewTracked = false;

	self.trackPageview = function () {
		if (!self.pageviewTracked && self.heapProjectId) {
			heap.load(self.heapProjectId.toString());
			self.pageviewTracked = true;
			self.identify();
		}
	};

	self.identify = function () {
		if (self.pageviewTracked && self.heapHandle) {
			var user = {
				handle: self.heapHandle,
				shipperType: self.shipperType
			};
			if (!user.shipperType) delete user.shipperType;
			heap.identify(user);
		}
	};

	uship.events.attach("heapTrack", function (event) {
		event = event || {};

		if (!self.pageviewTracked) {
			self.trackPageview();
		}
		if (self.pageviewTracked && event.name && event.data) {
			heap.track(event.name, event.data);
		}
	});

	if (!self.deferPageviewTracking) {
		self.trackPageview();
		self.identify();
	}
};