(function () {
    'use strict';

    var VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

    function bindSegment(group) {
        var select = document.getElementById(group.getAttribute('data-select'));
        if (!select) return;
        var radios = Array.prototype.slice.call(group.querySelectorAll('input[type="radio"]'));

        function sync() {
            var v = VALUE.get.call(select);
            radios.forEach(function (r) {
                r.checked = r.value === v;
            });
        }

        // app.js asettaa arvon suoraan (setVal) ilman tapahtumaa.
        Object.defineProperty(select, 'value', {
            configurable: true,
            get: function () {
                return VALUE.get.call(this);
            },
            set: function (v) {
                VALUE.set.call(this, v);
                sync();
            }
        });

        radios.forEach(function (r) {
            r.addEventListener('change', function () {
                if (!r.checked) return;
                select.value = r.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        select.addEventListener('change', sync);
        sync();
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-select]'), bindSegment);
})();
