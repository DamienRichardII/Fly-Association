/* Bouton « œil » : affiche / masque un champ mot de passe. <button data-eye="id-du-champ"> */
(function () {
  var OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SHUT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  document.querySelectorAll('[data-eye]').forEach(function (b) {
    var input = document.getElementById(b.getAttribute('data-eye'));
    if (!input) return;
    b.innerHTML = OPEN;
    b.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = show ? SHUT : OPEN;
      b.setAttribute('aria-pressed', show);
      b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
})();
