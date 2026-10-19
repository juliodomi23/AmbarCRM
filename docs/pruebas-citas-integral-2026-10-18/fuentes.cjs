// Solo el arnés local usa estas respuestas: evita descargar Google Fonts en las pruebas.
module.exports = new Proxy({}, {
  get(_target, url) {
    const familia = String(url).includes('Plus+Jakarta+Sans') ? 'Plus Jakarta Sans' : 'Inter';
    return `@font-face { font-family: '${familia}'; src: local('Arial'); font-style: normal; font-weight: 100 900; font-display: swap; }`;
  },
});
