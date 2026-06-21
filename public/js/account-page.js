(function accountPage() {
  const guestEl = document.getElementById("accountGuest");
  const loggedInEl = document.getElementById("accountLoggedIn");
  const authForm = document.getElementById("accountAuthForm");
  const authError = document.getElementById("accountAuthError");
  const oauthRegister = document.getElementById("accountOAuthRegister");
  const displayName = document.getElementById("accountDisplayName");
  const displayMeta = document.getElementById("accountDisplayMeta");
  const avatar = document.getElementById("accountAvatar");
  const emailFields = document.getElementById("accountEmailFields");
  const passwordBlock = document.getElementById("accountPasswordBlock");
  const rememberRow = document.getElementById("accountRememberRow");
  const authSubmit = document.getElementById("accountAuthSubmit");
  const passwordInput = document.getElementById("accountPasswordInput");
  const confirmPasswordBlock = document.getElementById("accountConfirmPasswordBlock");
  const confirmPasswordInput = document.getElementById("accountConfirmPasswordInput");
  const passwordToggle = document.getElementById("accountPasswordToggle");
  const forgotPasswordLink = document.getElementById("accountForgotPasswordLink");
  const emailError = document.getElementById("accountEmailError");
  const dashLink = document.getElementById("accountDashLink");

  let authMode = "login";
  let inputStarted = false;
  let inputMethod = "email";
  let appConfig = { googleClientId: "", appleClientId: "", oauthDevMode: false };
  let googleScriptLoaded = false;

  function t(key) {
    return typeof paintMarketT === "function" ? paintMarketT(key) : key;
  }

  function showError(el, msg) {
    if (!el) return;
    if (!msg) {
      el.textContent = "";
      el.classList.add("pm-account-hidden");
      return;
    }
    el.textContent = msg;
    el.classList.remove("pm-account-hidden");
  }

  function clearErrors() {
    showError(authError, "");
    showError(emailError, "");
  }

  function isStrongPassword(password) {
    const value = String(password || "");
    return value.length >= 8 && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
  }

  function updateAuthUi() {
    const isLogin = authMode === "login";
    const isEmail = inputMethod === "email";

    authForm?.classList.toggle("pm-account-hidden", !inputStarted);

    guestEl?.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      const on = btn.getAttribute("data-auth-mode") === authMode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    emailFields?.classList.toggle("pm-account-hidden", !inputStarted || !isEmail);

    const showPassword = inputStarted && isEmail;
    const showConfirmPassword = showPassword && !isLogin;
    passwordBlock?.classList.toggle("pm-account-hidden", !showPassword);
    confirmPasswordBlock?.classList.toggle("pm-account-hidden", !showConfirmPassword);
    forgotPasswordLink?.classList.toggle("pm-account-hidden", !isLogin);
    rememberRow?.classList.toggle("pm-account-hidden", !inputStarted || !isLogin);

    if (authSubmit) {
      if (!isLogin) {
        authSubmit.textContent = t("account_tab_register");
      } else {
        authSubmit.textContent = t("account_email_submit");
      }
    }

    if (passwordInput) {
      passwordInput.required = showPassword;
      passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
    }
    if (confirmPasswordInput) confirmPasswordInput.required = showConfirmPassword;
    const emailInput = authForm?.elements.email;
    if (emailInput) emailInput.required = inputStarted && isEmail;
  }

  function resetAuthForm() {
    updateAuthUi();
  }

  function renderLoggedIn(me) {
    const user = me?.user;
    const shop = me?.shop;
    if (!user) {
      guestEl?.classList.remove("pm-account-hidden");
      loggedInEl?.classList.add("pm-account-hidden");
      inputStarted = false;
      clearErrors();
      oauthRegister?.classList.add("pm-account-hidden");
      resetAuthForm();
      return;
    }
    guestEl?.classList.add("pm-account-hidden");
    loggedInEl?.classList.remove("pm-account-hidden");
    const name = shop?.name || user.email || "—";
    if (displayName) displayName.textContent = name;
    if (displayMeta) displayMeta.textContent = user.email || user.phone || "";
    if (avatar) avatar.textContent = String(name).trim().charAt(0).toUpperCase() || "P";
    if (dashLink) {
      if (user.role === "admin") {
        dashLink.href = "/paint/admin.html";
        dashLink.textContent = "Admin dashboard";
      } else if (user.role === "shop") {
        dashLink.href = "/paint/dashboard.html";
        dashLink.textContent = t("account_dashboard");
      } else {
        dashLink.href = "/paint/";
        dashLink.textContent = t("index_nav_home");
      }
    }
  }

  function afterLogin(data) {
    clearErrors();
    renderLoggedIn(data);
  }

  function handleNeedsRegistration(profile) {
    oauthRegister?.classList.remove("pm-account-hidden");
    const email = profile?.email ? encodeURIComponent(profile.email) : "";
    oauthRegister.href = email ? `/paint/register.html?email=${email}` : "/paint/register.html";
    showError(authError, t("account_err_no_account"));
  }

  async function loadGoogleScript() {
    if (googleScriptLoaded || !appConfig.googleClientId) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    googleScriptLoaded = true;
  }

  async function signInWithGoogle() {
    clearErrors();
    try {
      if (appConfig.googleClientId) {
        await loadGoogleScript();
        if (!globalThis.google?.accounts?.id) throw new Error("Google sign-in unavailable");
        await new Promise((resolve, reject) => {
          globalThis.google.accounts.id.initialize({
            client_id: appConfig.googleClientId,
            callback: async (resp) => {
              try {
                const data = await PaintApi.oauthLogin({ provider: "google", credential: resp.credential });
                afterLogin(data);
                resolve();
              } catch (e) {
                if (e?.data?.needsRegistration) handleNeedsRegistration(e.data.profile);
                else showError(authError, e.message || t("account_err_generic"));
                reject(e);
              }
            }
          });
          globalThis.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              reject(new Error("Google sign-in blocked"));
            }
          });
        });
        return;
      }
      if (appConfig.oauthDevMode) {
        const email = globalThis.prompt("Dev mode — enter Google email:");
        if (!email) return;
        const data = await PaintApi.oauthLogin({ provider: "google", email, name: email, subject: email });
        afterLogin(data);
        return;
      }
      showError(authError, "Google sign-in is not configured on this server.");
    } catch (e) {
      if (!e?.data?.needsRegistration) showError(authError, e.message || t("account_err_generic"));
    }
  }

  async function signInWithApple() {
    clearErrors();
    try {
      if (globalThis.AppleID?.auth?.signIn) {
        const res = await globalThis.AppleID.auth.signIn();
        const data = await PaintApi.oauthLogin({
          provider: "apple",
          subject: res.user || res.authorization?.id_token,
          email: res.user?.email,
          name: res.user?.name
        });
        afterLogin(data);
        return;
      }
      if (appConfig.oauthDevMode) {
        const email = globalThis.prompt("Dev mode — enter Apple email:");
        if (!email) return;
        const data = await PaintApi.oauthLogin({
          provider: "apple",
          email,
          name: email,
          subject: `apple-${email}`
        });
        afterLogin(data);
        return;
      }
      showError(authError, "Apple sign-in is not configured on this device.");
    } catch (e) {
      if (e?.data?.needsRegistration) handleNeedsRegistration(e.data.profile);
      else showError(authError, e.message || t("account_err_generic"));
    }
  }

  function goRegister() {
    const fd = new FormData(authForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    if (!email || !isStrongPassword(password)) {
      showError(emailError, t("account_err_email_password"));
      return;
    }
    if (password !== confirmPassword) {
      showError(emailError, t("account_err_password_match"));
      return;
    }
    const params = new URLSearchParams();
    params.set("email", email);
    try {
      sessionStorage.setItem("paint_register_email", email);
      sessionStorage.setItem("paint_register_password", password);
    } catch {
      /* ignore */
    }
    const qs = params.toString();
    window.location.href = qs ? `/paint/account-type.html?${qs}` : "/paint/account-type.html";
  }

  function handleLoginError(err, fd) {
    const email = String(fd.get("email") || "").trim().toLowerCase();
    try {
      const draftEmail = String(sessionStorage.getItem("paint_register_email") || "").trim().toLowerCase();
      const draftPassword = sessionStorage.getItem("paint_register_password") || "";
      if (err?.status === 401 && draftEmail && draftEmail === email && draftPassword) {
        const params = new URLSearchParams({ email });
        oauthRegister.href = `/paint/account-type.html?${params.toString()}`;
        oauthRegister.textContent = t("account_continue_setup");
        oauthRegister.classList.remove("pm-account-hidden");
        showError(emailError, t("account_err_complete_setup"));
        return;
      }
    } catch {
      /* ignore */
    }
    showError(emailError, err?.status === 401 ? t("account_err_invalid_login") : err.message || t("account_err_generic"));
  }

  document.getElementById("accountLogoutBtn")?.addEventListener("click", async () => {
    await PaintApi.logout();
    renderLoggedIn(null);
    resetAuthForm();
  });

  guestEl?.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      authMode = btn.getAttribute("data-auth-mode") || "login";
      inputStarted = false;
      clearErrors();
      oauthRegister?.classList.add("pm-account-hidden");
      resetAuthForm();
      updateAuthUi();
    });
  });

  guestEl?.querySelectorAll("[data-auth-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const method = btn.getAttribute("data-auth-method");
      if (method === "google") signInWithGoogle();
      else if (method === "apple") signInWithApple();
      else if (method === "email") {
        inputMethod = "email";
        inputStarted = true;
        clearErrors();
        resetAuthForm();
        updateAuthUi();
      }
    });
  });

  passwordToggle?.addEventListener("click", () => {
    if (!passwordInput) return;
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    passwordToggle.textContent = show ? "🙈" : "👁";
  });

  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    oauthRegister?.classList.add("pm-account-hidden");

    if (authMode === "register") {
      goRegister();
      return;
    }

    const fd = new FormData(authForm);

    if (inputMethod === "email") {
      try {
        const data = await PaintApi.login({
          email: fd.get("email"),
          password: fd.get("password")
        });
        afterLogin(data);
      } catch (err) {
        handleLoginError(err, fd);
      }
      return;
    }

    showError(emailError, t("account_err_generic"));
  });

  (async function boot() {
    updateAuthUi();

    try {
      appConfig = await PaintApi.publicConfig();
    } catch {
      /* ignore */
    }
    try {
      const me = await PaintApi.me();
      renderLoggedIn(me);
    } catch {
      renderLoggedIn(null);
    }
  })();
})();
