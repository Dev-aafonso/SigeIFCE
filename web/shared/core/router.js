(function () {
  "use strict";

  const path =
    window.location.pathname;

  const publicRoutes = [
    "/",
    "/login",
    "/cadastro",
    "/selecao-funcao",
  ];

  if (
    publicRoutes.includes(path)
  ) {
    return;
  }

  const token =
    localStorage.getItem(
      "sige_access_token"
    );

  if (!token) {
    window.location.href =
      "/login";
  }
})();
