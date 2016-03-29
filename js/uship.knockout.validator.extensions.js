;(function(validation, root){
    if (!validation) return;
    validation.rules['validPostalCode'] = {
        validator: function (val, options) {
            var valid = false;
 
            if (options.isUsingGooglePlaces) return true;

            if (!val || !options.countryId()) return false;
            
            jQuery.ajaxPro({
                type: 'GET',
                url: options.ajaxProPath,
                method: options.xhttpMethod,
                async:false, /*this is important. or else, it returns response before ajax response*/
                data: {
                    postalCode: val,
                    countryId: options.countryId()
                },
                success: function(response) {
                    valid = !!response;
                },
                failure: function(){
                    valid = false;
                }
            });
            return valid;
        },
        message: root.uship.localization['PriceEst_InvalidZipPostal']
    };

    validation.rules['unitCount'] = {
        validator: function (val, options) {
             return val!=undefined && options && /^-?\d*(?:)?$/.test(val.toString()) && options.min <= val  && val <= options.max;
        },
        message: root.uship.localization['DimensionInvalid']
    };
    validation.rules['ymm'] = {
        validator: function (val, options) {
             return !!val && +val >-1;
        }
    };
    validation.registerExtenders();
})(ko.validation, this);
