'use strict';

;(function (root, $) {
    var defaultFreightItem = {
        description: '',
        freightClass: '-1',
        hazardous: false,
        height: '',
        length: '',
        packagingType: '',
        stackable: false,
        unitCount: 1,
        unitWeight: '',
        weight: '',
        width: ''
    };

    var FreightItemsViewModel = function FreightItemsViewModel(options) {
        var self = this;
        self.freightItems = ko.observableArray();
        self.freightItemsAfterAdd = function (elem) {
            uship.ns.modalpanel.init();
            elem.nodeType === 1 && $(elem).hide().slideDown(200, function () {
                $(elem).show();
            });
        };
        self.freightItemsBeforeRemove = function (elem) {
            elem.nodeType === 1 && $(elem).slideUp(200, function () {
                $(elem).remove();
            });
        };
        self.handlingTypes = ko.observableArray([]);

        self.freightClassOptions = uship.steponeform.freightClassTypes;

        self.freightClassPromptOptions = [{ value: true, label: uship.loc('MainYes') }, { value: false, label: uship.loc('MainNo') }];
        self.hasFreightClass = ko.observable(false);
        self.toggleFreightClass = function (data) {
            if (data.value != self.hasFreightClass()) self.hasFreightClass(!self.hasFreightClass());
        };
        self.unitsOfMeasurement = ko.observableArray([{ value: 'Imperial', label1: uship.loc('MainIn'), label2: uship.loc('MainLbs') }, { value: 'Metric', label1: uship.loc('MainCm'), label2: uship.loc('MainKg') }]);
        self.systemOfMeasurement = ko.observable();
        self.weightUnits = ko.computed(function () {
            return self.systemOfMeasurement() === 'Metric' ? uship.loc('MainKg') : uship.loc('MainLbs');
        });
        self.dimensionUnits = ko.computed(function () {
            return self.systemOfMeasurement() === "Metric" ? uship.loc('MainCm') : uship.loc('ListingIn');
        });
        self.userSiteId = 1;
        self.handlingTypes(JSON.parse(options.freightTypes));

        self.bindFreightItems = function (freightItemsModel) {

            var hasFreightClass = freightItemsModel.freightItems.some(function (item) {
                return +item.freightClass > -1;
            });
            self.hasFreightClass(hasFreightClass);

            self.errors = ko.validation.group(self, { deep: true });
            self.systemOfMeasurement(freightItemsModel.systemOfMeasurement === "Metric" ? "Metric" : "Imperial");
            self.freightItems([]);
            self.freightItems(ko.utils.arrayMap(freightItemsModel.freightItems, function (freightItem) {
                var params = Conversion.fromDb(self.systemOfMeasurement() === 'Metric', Object.clone(freightItem));

                var packagingTypeIds = $.map(self.handlingTypes(), function (value) {
                    return value.value;
                });
                var pt = params.packagingType ? params.packagingType.toString() : null;
                if (packagingTypeIds.indexOf(pt) === -1) {
                    params.packagingType = null;
                }

                var freightItemViewModel = new FreightItemViewModel(params, self.systemOfMeasurement(), self.hasFreightClass);
                return freightItemViewModel;
            }));
        };

        self.addFreightItem = function () {
            self.freightItems.push(new FreightItemViewModel(defaultFreightItem, self.systemOfMeasurement(), self.hasFreightClass));
            uship.ns.modalpanel.init();
            self.errors = ko.validation.group(self, { deep: true });
        };

        self.removeFreightItem = function () {
            self.freightItems.remove(this);
            self.errors = ko.validation.group(self, { deep: true });
        };

        self.getFreightItems = function () {
            var freightItems = ko.toJS(self.freightItems);
            freightItems.map(function (item) {
                item.freightClass = self.hasFreightClass() ? item.freightClass : -1;
                item.length = !self.hasFreightClass() ? item.length : 0;
                item.width = !self.hasFreightClass() ? item.width : 0;
                item.height = !self.hasFreightClass() ? item.height : 0;
            });
            var sm = self.systemOfMeasurement();
            return {
                systemOfMeasurement: sm,
                freightItems: freightItems.map(function (item) {
                    return Conversion.toDb(sm === 'Metric', item);
                })
            };
        };
        self.DimsWarningMessage = ko.computed(function () {
            return self.systemOfMeasurement() === 'Imperial' ? uship.loc('listyourdimensions') : uship.loc('listyourdimensionsMetric');
        });
        self.prefill = function (freightItemsModel) {
            freightItemsModel && self.systemOfMeasurement(freightItemsModel.systemOfMeasurement);
            self.userSiteId = parseInt(freightItemsModel && freightItemsModel.userSiteId || uship.prefs.i18n.siteid || 1);
            if (!freightItemsModel || !freightItemsModel.freightItems) {
                self.freightItems().length === 0 && self.addFreightItem();
            } else {
                self.bindFreightItems(freightItemsModel);
            }
        };
    };

    var FreightItemViewModel = function FreightItemViewModel(params, systemOfMeasurement, hasFreightClass) {
        var self = this;
        self.hazardous = ko.observable(params.hazardous);
        self.packagingType = ko.observable(params.packagingType || undefined).extend({
            required: { message: uship.loc('HandlingTypeRequired') }
        });

        var classOptions = function classOptions(min) {
            return {
                required: {
                    message: uship.loc('FreightClassRequired'),
                    onlyIf: function onlyIf() {
                        return hasFreightClass();
                    }
                },
                min: {
                    params: min,
                    message: uship.loc('FreightClassRequired')
                }
            };
        };

        self.freightClass = ko.observable(params.freightClass > -1 ? params.freightClass : undefined).extend(classOptions(1));

        self.stackable = ko.observable(params.stackable);
        self.unitCount = ko.observable(params.unitCount).extend({
            unitCount: {
                min: 1,
                max: 999
            }
        });

        var dimOptions = function dimOptions(min, max) {
            return {
                required: {
                    message: uship.loc('registrationRequired'),
                    onlyIf: function onlyIf() {
                        return !hasFreightClass();
                    }
                },
                min: {
                    params: min,
                    message: uship.loc('DimensionInvalid')
                },
                max: {
                    params: max,
                    message: uship.loc('DimensionInvalid')
                }
            };
        };

        self.unitWeight = ko.observable(params.unitWeight).extend({
            required: { message: uship.loc('registrationRequired') },
            min: {
                params: 1,
                message: uship.loc('DimensionInvalid')
            },
            max: {
                params: 99999,
                message: uship.loc('DimensionInvalid')
            }
        });

        self.width = ko.observable(!hasFreightClass() ? params.width : undefined).extend(dimOptions(1, 999));
        self.height = ko.observable(!hasFreightClass() ? params.height : undefined).extend(dimOptions(1, 999));
        self.length = ko.observable(!hasFreightClass() ? params.length : undefined).extend(dimOptions(1, 999));

        self.totalWeight = ko.computed(function () {
            if (self.unitWeight.isValid() && self.unitCount.isValid()) {

                return self.unitWeight() * self.unitCount();
            } else {
                return 0;
            }
        }).extend({
            max: {
                params: 100000,
                message: uship.loc('TotalWeightExceeds')
            }
        });

        var dimWarningClose = ko.observable(false);

        self.showDimWarning = ko.computed(function () {
            if (!hasFreightClass()) {
                return self.width.isValid() && self.height.isValid() && self.length.isValid() && !dimWarningClose() && (systemOfMeasurement === 'Imperial' && (+self.height() <= 10 || +self.width() <= 10 || +self.length() <= 10) || systemOfMeasurement === 'Metric' && (+self.height() <= 25.4 || +self.width() <= 25.4 || +self.length() <= 25.4));
            }
        });

        self.closeWarning = function () {
            dimWarningClose(true);
        };
    };

    var Conversion = {
        _process: function _process(weightM, dimensionM, item) {
            item.unitWeight = Math.round(item.unitWeight * weightM);
            item.height = Math.round(item.height * dimensionM);
            item.width = Math.round(item.width * dimensionM);
            item.length = Math.round(item.length * dimensionM);
            item.weight = Math.round(item.unitWeight * item.unitCount);
            return item;
        },
        toDb: function toDb(isMetric, freightItem) {
            return this._process(isMetric ? 100 : 45.359237, isMetric ? 10 : 25.4, freightItem);
        },
        fromDb: function fromDb(isMetric, freightItem) {
            return this._process(1 / (isMetric ? 100 : 45.359237), 1 / (isMetric ? 10 : 25.4), freightItem);
        }
    };
    root.uship.namespace('steponeform').extend({
        FreightItemsViewModel: FreightItemsViewModel
    });
})(window, jQuery);