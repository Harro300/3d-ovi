(function () {
    'use strict';

    var VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

    function bindSegment(group) {
        var select = document.getElementById(group.getAttribute('data-select'));
        if (!select) return;
        var radios = Array.prototype.slice.call(group.querySelectorAll('input[type="radio"]'));

        var host = group.closest('[data-valikko]');
        var arvo = host && host.querySelector('[data-valikko-arvo]');

        function sync() {
            var v = VALUE.get.call(select);
            radios.forEach(function (r) {
                r.checked = r.value === v;
                if (r.checked && arvo) arvo.textContent = r.nextElementSibling.textContent;
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

    function bindMenu(host) {
        var button = host.querySelector('button');
        var menu = host.querySelector('[role="radiogroup"]');

        function close(focus) {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (focus) button.focus();
        }

        button.addEventListener('click', function () {
            var open = menu.hidden;
            menu.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            var picked = menu.querySelector('input:checked');
            if (open && picked) picked.focus();
        });
        menu.addEventListener('change', function () {
            close(true);
        });
        document.addEventListener('pointerdown', function (e) {
            if (!host.contains(e.target)) close(false);
        });
        host.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || menu.hidden) return;
            e.preventDefault();
            close(true);
        });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-select]'), bindSegment);
    Array.prototype.forEach.call(document.querySelectorAll('[data-valikko]'), bindMenu);
})();
