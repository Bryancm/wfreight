; (function (validation, $) {

    if (!validation || !$) return;

    var numericPattern = /[^\d]/g;
    var numericOnlyPattern = /^[\d]+$/;
    var emailPattern = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    var alphanumericPattern = /^[\u00C0-\u1FFF\u2C00-\uD7FFa-zA-Z\d]+$/;
    var letterReplacementPattern = /[^\u00C0-\u1FFF\u2C00-\uD7FFa-zA-Z]/g;
    var supportedCharacterPattern = /^[\u0000-\u00FF]+$/;

    ko.validation.rules.phoneUS = {
        validator: function (phoneNumber, validate) {
            if (!validate) return true;
            if (typeof (phoneNumber) !== 'string') { return false; }
            if (!phoneNumber || phoneNumber === '') { return true; } // makes it optional, use 'required' rule if it should be required

            phoneNumber = phoneNumber.replace(numericPattern, '');
            return validate && phoneNumber.length > 9 && phoneNumber.length <= 30;
        },
        message: uship.loc('RegistrationErrorPhoneValid')
    };

    ko.validation.rules.phoneUSFreight = {
        validator: function (phoneNumber, validate) {
            if (!validate) return true;
            if (typeof (phoneNumber) !== 'string') { return false; }
            if (!phoneNumber || phoneNumber === '') { return true; } // makes it optional, use 'required' rule if it should be required

            phoneNumber = phoneNumber.replace(numericPattern, '');
            return validate && phoneNumber.length > 9 && phoneNumber.length <= 10;
        },
        message: uship.loc('FreightErrorUsPhoneValid')
    };

    ko.validation.rules.notEmail = {
        validator: function (input, validate) {
            if (!validate || !input) return true;
            return !emailPattern.test(input);
        },
        message: uship.loc('notEmailError')
    };

    ko.validation.rules.phoneGlobal = {
        validator: function (phoneNumber, validate) {
            if (!validate) return true;
            if (typeof (phoneNumber) !== 'string') return false;
            if (!phoneNumber) return true; // makes it optional, use 'required' rule if it should be required

            phoneNumber = phoneNumber.replace(numericPattern, '');
            return numericOnlyPattern.test(phoneNumber) && phoneNumber.length <= 30;
        },
        message: uship.loc('RegistrationErrorPhoneValid')
    };

    ko.validation.rules.alphanumeric = {
        validator: function(value, validate) {
            if (!validate) return true;
            if (!value) return true; // makes it optional, use 'required' rule if it should be required

            return alphanumericPattern.test(value);
        },
        message: uship.loc('alphanumericInputError')
    };

    ko.validation.rules.numeric = {
        validator: function(value, validate) {
            if (!validate) return true;
            if (!value) return true;  // makes it optional, use 'required' rule if it should be required

            return numericOnlyPattern.test(value);
        },
        message: 'Please enter a numeric value.'
    };

    ko.validation.rules.requiresOneOf = {
      validator: function (val, fields) {
        var anyOne = ko.utils.arrayFirst(fields, function (field) {
          var stringTrimRegEx = /^\s+|\s+$/g,
                    testVal;

          var val = ko.unwrap(field);

          if (val === undefined || val === null)
            return !required;

          testVal = val;
          if (typeof (val) == "string") {
            testVal = val.replace(stringTrimRegEx, '');
          }

          return ((testVal + '').length > 0);

        });

        return (anyOne !== null);
      },
      message: 'One of these fields is required'

    };

    ko.validation.rules.containOneLetter = {
        validator: function (value, validate) {
            if (!validate) return true;
            if (!value) return true; // makes it optional, use 'required' rule if it should be required

            value = value.replace(letterReplacementPattern, '');

            return value.length > 0;
        },
        message: uship.loc('containsOneLetterError')
    };
	
	ko.validation.rules.containsOnlySupportedCharacters  = {
		validator: function (value, validate) {
			if (!validate) return true;
            if (!value) return true; // makes it optional, use 'required' rule if it should be required

            return supportedCharacterPattern.test(value);
		},
		message: uship.loc('alphanumericInputError')
	};

    ko.validation.rules.hasSufficientLocationInfo = {
        validator: function (place) {
            if (!place) return false;

            if (place.city) return true;

            if (place.route || place.streetNumber) return true;

            return false;
        },
        message: uship.loc('cityZipRequiredError')
    };

    validation.rules.availableUsername = {
        async: true,
        validator: function(username, params, callback) {
            checkCredential('/mvc/register/UsernameIsAvailable?username=', username).always(callback);
        },
        message: uship.loc('usernameAlreadyTakenError')
    };

    validation.rules.availableEmailAddress = {
        async: true,
        validator: function(emailAddress, params, callback) {
            checkCredential('/mvc/register/EmailAddressIsAvailable?emailAddress=', emailAddress).always(callback);
        },
        message: uship.loc('emailAlreadyTakenError')
    };

    validation.rules.emailAddressInSystem = {
        async: true,
        validator: function(emailAddress, params, callback) {
            checkCredential('/mvc/Users/ForgotPassword/EmailAddressInSystem?emailAddress=', emailAddress).always(callback);
        },
        message: uship.loc('noEmailFoundError')
    };

    validation.rules.isSupportedCountry = {
        async: true,
        validator: function (place, params, callback) {
            if (params && params.useMvcCall === false) {
                checkCountrySupportedViaCodebehind(place).always(callback);
            } else {
                checkCountrySupported(place).always(callback);
            }
        },
        message: 'At this time, we cannot ship within this country'
    };

    var checkCredential = function(url, credential) {
        var dfd = $.Deferred();
        if (typeof credential === 'undefined') {
            return dfd.resolve(true).promise();
        }

        $.ajax({
            url: url + encodeURIComponent(credential),
            type: 'GET'
        }).then(function(res) {
            dfd.resolve(res === 'True');
        });

        return dfd.promise();
    };

    var checkCountrySupported = function (place) {

        var dfd = $.Deferred();
        if (typeof place === 'undefined' || place.countryCode === '') {
            return dfd.resolve(true).promise();
        }

        $.ajax({
            type: 'GET',
            url: '/mvc/List/GetCountrySupported?countryCode=' + place.countryCode
        }).then(function (res) {
            dfd.resolve(res.isSupported);
        });

        return dfd.promise();  
    };

    var checkCountrySupportedViaCodebehind = function (place) {

        var dfd = $.Deferred();
        if (typeof place === 'undefined' || place.countryCode === '') {
            return dfd.resolve(true).promise();
        }

        $.ajaxPro({
            type: 'POST',
            url: '/ajaxpro/id3Solutions.UShip.Web.StepOneForm,id3Solutions.UShip.ashx',
            method: 'CheckUnsupportedCountries',
            data: { 'countryCode' : encodeURIComponent(place.countryCode) }
        }).then(function (res) {
            dfd.resolve(JSON.parse(res).isSupported);
        });

        return dfd.promise();  
    }

    validation.registerExtenders();

}(this.ko.validation, this.jQuery));