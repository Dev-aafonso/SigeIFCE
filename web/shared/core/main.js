(function () {
  "use strict";

  const API = "";

  function saveSession(data) {
    if (!data || !data.accessToken) {
      return;
    }

    localStorage.setItem(
      "sige_access_token",
      data.accessToken
    );

    if (data.user) {
      localStorage.setItem(
        "sige_user",
        JSON.stringify(data.user)
      );
    }
  }

  function getToken() {
    return localStorage.getItem(
      "sige_access_token"
    );
  }

  function showMessage(id, text, type) {
    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent = text;
    element.className =
      "form-message " + (type || "");
  }

  async function request(url, options = {}) {
    const token = getToken();

    const headers = {
      "Content-Type":
        "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization =
        "Bearer " + token;
    }

    const response = await fetch(
      API + url,
      {
        ...options,
        headers,
      }
    );

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      data = await response.json();
    } else {
      data = {};
    }

    if (!response.ok) {
      const message =
        data.message ||
        "Não foi possível concluir a operação.";

      throw new Error(
        Array.isArray(message)
          ? message.join(" ")
          : message
      );
    }

    return data;
  }

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const loginForm =
    document.getElementById(
      "login-form"
    );

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        const email =
          document.getElementById(
            "email"
          ).value.trim();

        const password =
          document.getElementById(
            "password"
          ).value;

        try {

          showMessage(
            "login-message",
            "Entrando...",
            ""
          );

          const data =
            await request(
              "/auth/login",
              {
                method: "POST",
                body: JSON.stringify({
                  email,
                  password,
                }),
              }
            );

          saveSession(data);

          showMessage(
            "login-message",
            "Login realizado. Redirecionando...",
            "success"
          );

          if (
            data.user &&
            data.user.role
          ) {
            window.location.href =
              "/sistema";
          } else {
            window.location.href =
              "/selecao-funcao";
          }

        } catch (error) {

          showMessage(
            "login-message",
            error.message,
            "error"
          );
        }
      }
    );
  }

  // ----------------------------------------------------------
  // CADASTRO
  // ----------------------------------------------------------

  const registerForm =
    document.getElementById(
      "register-form"
    );

  if (registerForm) {

    registerForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        const email =
          document.getElementById(
            "register-email"
          ).value.trim();

        const emailConfirmation =
          document.getElementById(
            "register-email-confirm"
          ).value.trim();

        const password =
          document.getElementById(
            "register-password"
          ).value;

        const passwordConfirmation =
          document.getElementById(
            "register-password-confirm"
          ).value;

        if (
          email !==
          emailConfirmation
        ) {
          showMessage(
            "register-message",
            "Os e-mails não coincidem.",
            "error"
          );
          return;
        }

        if (
          password !==
          passwordConfirmation
        ) {
          showMessage(
            "register-message",
            "As senhas não coincidem.",
            "error"
          );
          return;
        }

        try {

          showMessage(
            "register-message",
            "Criando sua conta...",
            ""
          );

          const data =
            await request(
              "/auth/register",
              {
                method: "POST",
                body: JSON.stringify({
                  email,
                  password,
                  passwordConfirmation,
                }),
              }
            );

          saveSession(data);

          showMessage(
            "register-message",
            "Conta criada. Redirecionando...",
            "success"
          );

          window.location.href =
            "/selecao-funcao";

        } catch (error) {

          showMessage(
            "register-message",
            error.message,
            "error"
          );
        }
      }
    );
  }

  // ----------------------------------------------------------
  // SELECAO DE FUNCAO
  // ----------------------------------------------------------

  const roleButtons =
    document.querySelectorAll(
      ".role-button"
    );

  roleButtons.forEach(
    function (button) {

      button.addEventListener(
        "click",
        async function () {

          const role =
            button.dataset.role;

          if (!getToken()) {
            window.location.href =
              "/login";
            return;
          }

          try {

            button.disabled =
              true;

            button.style.opacity =
              "0.7";

            showMessage(
              "role-message",
              "Salvando sua função...",
              ""
            );

            const response =
              await request(
                "/users/me/role",
                {
                  method: "PATCH",
                  body: JSON.stringify({
                    role,
                  }),
                }
              );

            const current =
              JSON.parse(
                localStorage.getItem(
                  "sige_user"
                ) || "{}"
              );

            current.role =
              response.role ||
              role;

            localStorage.setItem(
              "sige_user",
              JSON.stringify(current)
            );

            showMessage(
              "role-message",
              "Função selecionada. Redirecionando...",
              "success"
            );

            setTimeout(
              function () {
                window.location.href =
                  "/sistema";
              },
              500
            );

          } catch (error) {

            button.disabled =
              false;

            button.style.opacity =
              "1";

            showMessage(
              "role-message",
              error.message,
              "error"
            );
          }
        }
      );
    }
  );

})();
