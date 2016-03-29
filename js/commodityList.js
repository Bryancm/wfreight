'use strict';

;(function (root, $) {
    var Commodities = function Commodities(commodities) {
        var self = this;
        self.commodityList = [];
        self.Commodity = function (id) {
            id = id.toString();
            return {
                value: id,
                label: uship.localization.commodities[id]
            };
        };
        self.buildCommodities = function () {
            for (var i = 0, size = commodities.length; i < size; i++) {
                var currentCommodity = commodities[i];
                var comm = new self.Commodity(currentCommodity.Commodity);
                var subCommodityList = [];
                if (currentCommodity.SubCommodities) {
                    for (var j = 0, subCommoditiesSize = currentCommodity.SubCommodities.length; j < subCommoditiesSize; j++) {
                        subCommodityList.push(new self.Commodity(currentCommodity.SubCommodities[j]));
                    }
                }
                comm.children = subCommodityList;
                self.commodityList.push(comm);
            }
        };

        self.buildCommodities();
    };
    root.uship.namespace('commodityList').extend({
        Commodities: Commodities
    });
})(window, jQuery);