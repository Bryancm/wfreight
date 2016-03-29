'use strict';

(function (root, $) {
	var CarMotoViewModel = function CarMotoViewModel(params) {
		var self = this;
		$.extend(self, new uship.steponeform.DefaultViewModel(params.options));
		self._makes = {};
		self._models = {};
		self.enableMake = ko.observable();
		self.enableModel = ko.observable();
		self.selectedAccessorials = ko.observableArray();
		self.yearsAjaxMethod = 'GetYears';
		self.makesAjaxMethod = 'GetMakesByYear';
		self.modelsAjaxMethod = 'GetModelsByYearMake';
		self.ajaxProPath = String.format('/ajaxpro/id3Solutions.UShip.Web.{0},id3Solutions.UShip.ashx', params.ajaxProClass);
		self.years = ko.observableArray([]);
		self.makes = ko.observableArray([]);
		self.models = ko.observableArray([]);
		self.isUS = uship.prefs.i18n.siteid === 1;
		self.isCLT = params.isCLT;
		self.cltItems = ko.observableArray();
		self.motoItems = ko.observableArray();

		self.processResponse = function (arr) {
			return arr.map(function (item) {
				return { value: item[0].toString(), label: item[1].toString() };
			});
		};

		self.year = ko.observable();
		self.make = ko.observable();
		self.makeName = ko.computed(function () {
			var makeVal = self.make(),
			    _m = self.makes().filter(function (m) {
				return m.value === makeVal;
			})[0];
			return _m ? _m.label : '';
		});
		self.model = ko.observable();
		self.modelName = ko.computed(function () {
			var modelVal = self.model(),
			    _m = self.models().filter(function (m) {
				return m.value === modelVal;
			})[0];
			return _m ? _m.label : '';
		});

		self.validYear = ko.computed(function () {
			return +self.year() > 0;
		});

		self.validMake = function () {
			return +self.make() > 0;
		};

		self.validModel = function () {
			return +self.model() > 0;
		};

		if (self.isUS && params.options.validateCLT) {
			self.year.extend({
				required: {
					message: uship.loc('interviewprocCarItemByTextBoxSelectYear')
				}
			});

			self.make.extend({
				required: {
					message: uship.loc('MakeRequired'),
					onlyIf: function onlyIf() {
						return +self.year() > 0 && self.enableMake();
					}
				}
			});

			self.model.extend({
				required: {
					message: uship.loc('ModelRequired'),
					onlyIf: function onlyIf() {
						return +self.make() > 0 && self.enableModel();
					}
				}
			});
		}

		function getYmm(method, data, callback) {
			$.ajaxPro({
				type: 'GET',
				url: self.ajaxProPath,
				method: method,
				data: data,
				success: function success(response) {
					callback && callback(self.processResponse(response));
				}
			});
		};

		function setMakes(makes) {
			self.makes(makes);
			if (!self.makes().some(function (x) {
				return +x.value === +self.make();
			})) {
				self.make(undefined);
			}
			self.make.isModified(false);
		}

		function setModels(models) {
			self.models(models);
			if (!self.models().some(function (x) {
				return +x.value === +self.model();
			})) {
				self.model(undefined);
			}
			self.model.isModified(false);
		}
		function clearModels() {
			setModels([]);
		}

		getYmm(self.yearsAjaxMethod, {}, function (response) {
			self.years(response);
			if (!self.validYear()) {
				self.year(undefined);
			}
		});

		self.year.subscribe(function (selected_year) {
			self.enableModel(false);
			clearModels();
			selected_year = +selected_year;

			if (!self.validYear()) {
				self.makes([]);
				self.enableMake(false);
				return;
			}

			var makes = self._makes[selected_year];

			if (makes) {
				setMakes(makes);
				return;
			}

			getYmm(self.makesAjaxMethod, { year: selected_year }, function (response) {
				response = ko.utils.arrayFilter(response, function (item) {
					return item.value != -1;
				});
				setMakes(response);

				if (!self.validMake()) {
					self.make(undefined);
					self.make.isModified(false);
				}

				self._makes[selected_year] = self.makes();
				self.enableMake(true);
			});
		});

		self.make.subscribe(function (selected_make) {
			selected_make = +selected_make;

			if (isNaN(selected_make)) return;

			var selected_year = +self.year();

			if (selected_make <= 0) {
				clearModels();
				return;
			}

			var models = self._models[selected_year + '_' + selected_make];
			if (models) {
				setModels(models);
				self.enableModel(true);
				return;
			}

			getYmm(self.modelsAjaxMethod, { year: self.year(), make: selected_make }, function (response) {
				response = ko.utils.arrayFilter(response, function (item) {
					return item.value != -1;
				});
				setModels(response);

				if (!self.validModel()) {
					self.model(undefined);
					self.model.isModified(false);
				}

				self._models[selected_year + '_' + selected_make] = self.models();
				self.enableModel(true);
			});
		});

		self.getFormModel = function () {
			return {
				selectedAccessorials: self.selectedAccessorials(),
				location: self.getDefaultLocationModel(),
				itemsModel: self.getItemsModel()
			};
		};

		self.getItemsModel = function () {
			var returnModel = {};

			if (self.isCLT) {
				self.cltItems([]);
				self.cltItems.push({ Year: self.year(), MakeID: self.make(), MakeName: self.makeName(), ModelID: self.model(), ModelName: self.modelName() });
				returnModel.cltItems = ko.toJS(self.cltItems);
			} else {
				self.motoItems([]);
				self.motoItems.push({ Year: self.year(), MakeID: self.make(), MakeName: self.makeName(), ModelID: self.model(), ModelName: self.modelName() });
				returnModel.motoItems = ko.toJS(self.motoItems);
			}

			return returnModel;
		};

		self.prefill = function (model) {

			var ymmModel;
			if (model.itemsModel) {
				ymmModel = self.isCLT ? model.itemsModel.cltItems : model.itemsModel.motoItems;
			}

			if (ymmModel) {
				var item = ymmModel[0];

				if (item) {
					self.year(item.Year.toString());
					self.make(item.MakeID.toString());
					self.model(item.ModelID.toString());
					self.selectedAccessorials(this.accessorials().filter(function (x) {
						return item[x.modelField] === true;
					}).map(function (x) {
						return x.value;
					}));
				}
			} else {
				self.selectedAccessorials(model.selectedAccessorials || ['a_running']);
			}

			self.defaultLocationPrefill(model.location);
		};

		self.prepareGooglePlacesForValidation = function () {
			self.pickup.extendGooglePlacesQueryForValidation();
			self.delivery.extendGooglePlacesQueryForValidation();
		};

		self.isFormValid = function () {
			var dfd = $.Deferred();
			if (uship.prefs.i18n.siteid === 1 || params.options.displayMode === 'steptwoform') {
				if (params.options.isGooglePlacesEnabled) {
					self.prepareGooglePlacesForValidation();
				}
				ko.validation.group(self, { deep: true });
				var validationCheck = self.isValidating.subscribe(function (isValidating) {
					if (!isValidating) {

						// Since subscription happens every time isFormValid is called
						// We must dispose of the subscription when we're done to avoid memory leak
						validationCheck.dispose();
					}
					if (self.errors().length > 0) {
						self.errors = ko.validation.group(self, { deep: true });
						self.errors.showAllMessages();
						dfd.reject();
					} else {
						dfd.resolve();
					}
				});
			} else {
				// Assume passes validation
				dfd.resolve();
			}
			return dfd.promise();
		};

		self.errors = ko.validation.group(self, { deep: true });
	};
	var CLTViewModel = function CLTViewModel(options, model) {
		var self = this;
		self.accessorials = ko.observableArray([{
			value: 'a_running',
			label: uship.loc('homepage_operable'),
			modelField: 'IsRunning'
		}, {
			value: 'a_convertible',
			label: uship.loc('listing_outputCarItemConvertible'),
			modelField: 'IsConvertible'
		}, {
			value: 'a_modified',
			label: uship.loc('listing_outputCarItemModified'),
			modelField: 'IsModified'
		}]);

		$.extend(self, new CarMotoViewModel({
			options: options,
			ajaxProClass: 'CarListingItemControl',
			isCLT: true
		}));

		//this has to be after $.extend to properly override formname
		self.formName = 'cltForm';
		self.afterRender = function () {
			self.selectedAccessorials(model.selectedAccessorials || ['a_running']);
			self.pickup.showEnabledOriginAndDestination();
			self.delivery.showEnabledOriginAndDestination();
		};

		self.handlePostSubmit = function (response) {
			if (options.isIframe) {
				window.parent.location.href = response.redirect;
			} else {
				window.location = response.redirect;
			}
		};

		model && self.prefill(model);
	};

	var MotoViewModel = function MotoViewModel(options, model) {
		var self = this;

		self.accessorials = ko.observableArray([{
			value: 'a_running',
			label: uship.loc('homepage_operable'),
			modelField: 'IsRunning'
		}, {
			value: 'a_trike',
			label: uship.loc('listing_outputMotosTrike'),
			modelField: 'IsTrike'
		}, {
			value: 'a_sidecar',
			label: uship.loc('listing_outputMotosSidecar'),
			modelField: 'HasSidecar'
		}, {
			value: 'a_palletized',
			label: uship.loc('listing_outputFurnitureMultiPalletized'),
			modelField: 'IsPalletized'
		}]);

		$.extend(self, new CarMotoViewModel({
			options: options,
			ajaxProClass: 'MotoListingItemControl',
			isCLT: false
		}));

		//this has to be after $.extend to properly override formname
		self.formName = 'motoForm';
		self.afterRender = function () {
			self.selectedAccessorials(model.selectedAccessorials || ['a_running']);
			self.pickup.showEnabledOriginAndDestination();
			self.delivery.showEnabledOriginAndDestination();
		};

		self.handlePostSubmit = function (response) {
			if (options.isIframe) {
				window.parent.location.href = response.redirect;
			} else {
				window.location = response.redirect;
			}
		};

		model && self.prefill(model);
	};

	root.uship.namespace('steponeform').extend({
		MotoViewModel: MotoViewModel
	});

	root.uship.namespace('steponeform').extend({
		CLTViewModel: CLTViewModel
	});
})(window, jQuery);