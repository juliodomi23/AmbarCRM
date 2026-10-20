const correos = [];
let fallar = false;
let demoraMs = 0;

module.exports = {
  correos,
  fallar: (valor) => { fallar = valor; },
  demorar: (valor) => { demoraMs = valor; },
  createTransport(opciones) {
    if (opciones.logger !== false || opciones.debug !== false) throw new Error("El correo no debe habilitar logs SMTP");
    return {
      async sendMail(correo) {
        if (demoraMs) await new Promise((resolve) => setTimeout(resolve, demoraMs));
        if (fallar) throw new Error("Error SMTP simulado");
        correos.push(correo);
        return { accepted: [correo.to] };
      },
    };
  },
};
