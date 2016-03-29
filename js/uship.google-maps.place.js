'use strict';

;(function (root) {

    var Place = function Place(placeResult) {
        this.updateResult(placeResult);
        return this;
    };

    var selectPlaceResultWithMatchingCity = function selectPlaceResultWithMatchingCity(city, results) {

        //find a result with a matching city that has a postal code
        //results are orderd with decreasing percision vis-a-vis the user's query as judged by google
        var matchingCityResult;
        if (results.length > 1) {
            for (var i = 0; i < results.length; ++i) {
                var parsedResult = new Place(results[i]);
                if (parsedResult.city === city && parsedResult.postalCode) {
                    matchingCityResult = results[i];
                    return matchingCityResult;
                } else if (parsedResult.city === city) {
                    matchingCityResult = results[i];
                }
            }
        }

        //no result that has both matching city and postal code
        var parsedFirstResult = new Place(results[0]);
        if (parsedFirstResult.postalCode) {
            //if the first result has a postal code let's return it
            return results[0];
        } else if (matchingCityResult) {
            //first result does not have a postal code, so just return a result with a matching city and no postal code
            return matchingCityResult;
        }

        //at this point, simply default to the first result.
        return results[0];
    };

    Place.prototype = {
        hasResult: function hasResult() {
            return !!this._place.geometry;
        },

        parsePlaceResult: function parsePlaceResult() {
            this.userQuery = this._place.name;
            this.formattedAddress = this.hasResult() ? this._place.formatted_address : this._place.name;
            this.streetNumber = this.getAddressComponentOfType('street_number');
            this.route = this.getAddressComponentOfType('route');
            this.neighborhood = this.getAddressComponentOfType('neighborhood');
            this.postalCode = this.getAddressComponentOfType('postal_code');
            this.city = this.getAddressComponentOfType('locality') || this.getAddressComponentOfType('sublocality') || this.getAddressComponentOfType('postal_town') || this.getAddressComponentOfType('administrative_area_level_3');
            this.state = this.getAddressComponentOfType('administrative_area_level_1', 'short_name');
            this.country = this.getAddressComponentOfType('country');
            this.countryCode = this.getAddressComponentOfType('country', 'short_name');
            this.latitude = this.hasResult() ? this._place.geometry.location.lat() : NaN;
            this.longitude = this.hasResult() ? this._place.geometry.location.lng() : NaN;
            this.placeTypes = this._place.types || [];

            return this;
        },

        updateResult: function updateResult(placeResult) {
            this._place = placeResult || {};
            return this.parsePlaceResult();
        },

        getAddressComponentOfType: function getAddressComponentOfType(type, returnField) {
            if (!this.hasResult()) return '';
            var matching = this._place.address_components.filter(function (item) {
                return item.types.indexOf(type) >= 0;
            });
            returnField = returnField || 'long_name';
            return matching.length ? matching[0][returnField] : '';
        },

        isPlaceOfType: function isPlaceOfType(type) {
            return this.placeTypes.indexOf(type) >= 0;
        }

    };

    root.uship.namespace('googleMaps').extend({
        Place: Place,
        selectPlaceResultWithMatchingCity: selectPlaceResultWithMatchingCity
    });
})(window);