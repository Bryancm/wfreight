'use strict';

;(function (root, $) {
    var PostalCodeLookupViewModel = function PostalCodeLookupViewModel(options) {
        var self = this;
        self.ajaxProPath = options.ajaxProPath;
        self.provinces = options.provinces;
        self.lookingUpPostalCode = ko.observable(false);
        self.errors = ko.validation.group(self);
        self.country = options.country;
        self.callback = options.callback;
        self.loadProvinces = options.loadProvinces;
        self.showoverride = true;
        self.city = ko.observable(undefined).extend({
            required: {
                message: uship.loc('CityNameRequired'),
                onlyIf: function onlyIf() {
                    return self.lookingUpPostalCode();
                }
            }
        });

        self.provinceValue = ko.observable(undefined).extend({
            required: {
                message: uship.loc('ProvinceRequired'),
                onlyIf: function onlyIf() {
                    return self.lookingUpPostalCode();
                }
            }
        });

        self.province = ko.computed(function () {
            return self.provinces().filter(function (province) {
                return province.value === self.provinceValue();
            })[0];
        });

        self.showPostalCodeLookup = function (context, event) {
            var url = {
                3: 'http://www.royalmail.com/postcode-finder/',
                12: 'http://www.correoargentino.com.ar/cpa/',
                15: 'http://auspost.com.au/apps/postcode.html',
                16: 'http://at.postleitzahl.org/',
                44: 'http://www.correos.cl/SitePages/home.aspx',
                46: 'http://190.26.208.149/CodigosPostales/Index.html#app=76ee&4817-selectedIndex=1',
                31: 'http://www.correios.com.br/',
                70: 'http://www.laposte.fr/Entreprise/Outils-Indispensables/Outils/Trouvez-un-code-postal',
                76: 'http://www.postdirekt.de/plzserver/',
                94: 'http://www.indiapost.gov.in/pin/',
                129: 'http://www.sepomex.gob.mx/ServiciosLinea/Paginas/ccpostales.aspx',
                139: 'http://www.postnl.nl/voorthuis/klantenservice/postcodezoeker/?bnr=dp-cm-bnr200911-hpcm-ql1-postcodezoeker',
                178: 'http://www.postoffice.co.za/tools/postalcode.html',
                179: 'http://www.correos.es/comun/CodigosPostales/1010_s-CodPostal.asp',
                207: 'http://www.ipostel.gob.ve/nlinea/codigo_postal.php'
            }[self.country().id];

            if (url) window.open(url);else {
                self.loadProvinces();
                self.showoverride && self.showModal(event);
            }
        };

        self.lookupPostalCode = function () {
            var errors = ko.validation.group(self);

            if (errors().length > 0) errors.showAllMessages();else $.ajaxPro({
                type: 'GET',
                url: self.ajaxProPath,
                method: 'LookupPostalCode',
                data: {
                    city: self.city(),
                    province: self.province().code,
                    country: self.country().id
                },
                success: function success(response) {
                    self.callback(JSON.parse(response).postalCode);
                    self.lookingUpPostalCode(false);
                }
            });
        };

        self.showModal = function (event) {
            event && event.stopPropagation();
            if (self.showoverride) {
                $('body').bind('click.postalcodelookup', self.hideModal.bind(self));

                self.lookingUpPostalCode(true);
                self.showoverride = false;
            }
        };
        self.bindModalShowBehavior = function () {
            $('body').unbind('click.postalcodelookup');
            self.lookingUpPostalCode(false);
            self.showoverride = true;
        };
        self.hideModal = function (event) {
            event.stopPropagation();
            self.bindModalShowBehavior();
        };
        //this is the afterrender function which runs after ui is updated.
        //it gets called from html. dont remove this.
        self.unbindClicksByDefault = function () {
            $('.postal-code-lookup').each(function (k, item) {
                $(item).click(function (event) {
                    event.stopPropagation();
                });
            });
            $('.postal-code-close').each(function (k, item) {
                $(item).bind('click.postalcodelookup', self.hideModal.bind(self));
            });
        };
        self.bindModalShowBehavior();
    };

    root.uship.namespace('steponeform').extend({
        PostalCodeLookupViewModel: PostalCodeLookupViewModel
    });
})(window, jQuery);