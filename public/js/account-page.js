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
  const phoneFields = document.getElementById("accountPhoneFields");
  const phoneCodeBlock = document.getElementById("accountPhoneCodeBlock");
  const passwordBlock = document.getElementById("accountPasswordBlock");
  const rememberRow = document.getElementById("accountRememberRow");
  const authSubmit = document.getElementById("accountAuthSubmit");
  const phoneInput = document.getElementById("accountPhoneInput");
  const phoneClear = document.getElementById("accountPhoneClear");
  const phoneCountryBtn = document.getElementById("accountPhoneCountry");
  const phoneCountryCode = document.getElementById("accountPhoneCountryCode");
  const phoneDial = document.getElementById("accountPhoneDial");
  const phoneExample = document.getElementById("accountPhoneExample");
  const passwordInput = document.getElementById("accountPasswordInput");
  const passwordToggle = document.getElementById("accountPasswordToggle");
  const phoneError = document.getElementById("accountPhoneError");
  const emailError = document.getElementById("accountEmailError");
  const dashLink = document.getElementById("accountDashLink");

  const DIAL_BY_COUNTRY = { AE: "+971", OM: "+968", SA: "+966" };
  const EXAMPLE_BY_COUNTRY = {
    AE: "+971 50 123 4567",
    OM: "+968 9737 3518",
    SA: "+966 50 123 4567"
  };

  let authMode = "login";
  let inputMethod = "phone";
  let phoneCodeSent = false;
  let phoneCountry = "OM";
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
    showError(phoneError, "");
  }

  function readStoredCountry() {
    try {
      return localStorage.getItem("paint_market_country") || "OM";
    } catch {
      return "OM";
    }
  }

  function syncPhoneCountry(code) {
    phoneCountry = String(code || "OM").toUpperCase();
    if (phoneCountryCode) phoneCountryCode.textContent = phoneCountry;
    const dial = DIAL_BY_COUNTRY[phoneCountry] || "+968";
    if (phoneDial) phoneDial.textContent = dial;
    if (phoneExample) {
      const ex = EXAMPLE_BY_COUNTRY[phoneCountry] || EXAMPLE_BY_COUNTRY.OM;
      phoneExample.textContent = `${t("account_phone_example_prefix")} ${ex}`;
    }
  }

  function fullPhoneNumber(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    const dial = (DIAL_BY_COUNTRY[phoneCountry] || "+968").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith(dial)) return `+${digits}`;
    return `+${dial}${digits}`;
  }

  function updateAuthUi() {
    const isLogin = authMode === "login";
    const isEmail = inputMethod === "email";
    const isPhone = inputMethod === "phone";

    guestEl?.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      const on = btn.getAttribute("data-auth-mode") === authMode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    guestEl?.querySelectorAll("[data-input-method]").forEach((btn) => {
      const on = btn.getAttribute("data-input-method") === inputMethod;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    emailFields?.classList.toggle("pm-account-hidden", !isEmail);
    phoneFields?.classList.toggle("pm-account-hidden", !isPhone);

    const showPassword = isLogin && isEmail;
    passwordBlock?.classList.toggle("pm-account-hidden", !showPassword);
    rememberRow?.classList.toggle("pm-account-hidden", !isLogin);

    const showCode = isLogin && isPhone && phoneCodeSent;
    phoneCodeBlock?.classList.toggle("pm-account-hidden", !showCode);

    if (authSubmit) {
      if (!isLogin) {
        authSubmit.textContent = t("account_tab_register");
      } else if (isPhone && !phoneCodeSent) {
        authSubmit.textContent = t("account_phone_send");
      } else if (isPhone && phoneCodeSent) {
        authSubmit.textContent = t("account_phone_verify");
      } else {
        authSubmit.textContent = t("account_email_submit");
      }
    }

    if (passwordInput) {
      passwordInput.required = showPassword;
      passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
    }
    if (phoneInput) phoneInput.required = isPhone;
    const emailInput = authForm?.elements.email;
    if (emailInput) emailInput.required = isEmail;
  }

  function resetPhoneFlow() {
    phoneCodeSent = false;
    phoneCodeBlock?.classList.add("pm-account-hidden");
    const codeInput = authForm?.elements.code;
    if (codeInput) codeInput.value = "";
    updateAuthUi();
  }

  function renderLoggedIn(me) {
    const user = me?.user;
    const shop = me?.shop;
    if (!user) {
      guestEl?.classList.remove("pm-account-hidden");
      loggedInEl?.classList.add("pm-account-hidden");
      return;
    }
    guestEl?.classList.add("pm-account-hidden");
    loggedInEl?.classList.remove("pm-account-hidden");
    const name = shop?.name || user.email || "—";
    if (displayName) displayName.textContent = name;
    if (displayMeta) displayMeta.textContent = user.email || user.phone || "";
    if (avatar) avatar.textContent = String(name).trim().charAt(0).toUpperCase() || "P";
    if (dashLink) {
      dashLink.href = user.role === "admin" ? "/paint/admin.html" : "/paint/dashboard.html";
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
    const params = new URLSearchParams();
    if (inputMethod === "email" && fd.get("email")) params.set("email", String(fd.get("email")));
    if (inputMethod === "phone" && fd.get("phone")) params.set("phone", fullPhoneNumber(fd.get("phone")));
    const qs = params.toString();
    window.location.href = qs ? `/paint/register.html?${qs}` : "/paint/register.html";
  }

  document.getElementById("accountLogoutBtn")?.addEventListener("click", async () => {
    await PaintApi.logout();
    renderLoggedIn(null);
    resetPhoneFlow();
  });

  guestEl?.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      authMode = btn.getAttribute("data-auth-mode") || "login";
      clearErrors();
      resetPhoneFlow();
      updateAuthUi();
    });
  });

  guestEl?.querySelectorAll("[data-input-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      inputMethod = btn.getAttribute("data-input-method") || "phone";
      clearErrors();
      resetPhoneFlow();
      updateAuthUi();
    });
  });

  guestEl?.querySelectorAll("[data-auth-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const method = btn.getAttribute("data-auth-method");
      if (method === "google") signInWithGoogle();
      else if (method === "apple") signInWithApple();
    });
  });

  phoneInput?.addEventListener("input", () => {
    if (phoneClear) phoneClear.hidden = !phoneInput.value;
    if (phoneCodeSent) resetPhoneFlow();
  });

  phoneClear?.addEventListener("click", () => {
    if (phoneInput) {
      phoneInput.value = "";
      phoneInput.focus();
    }
    phoneClear.hidden = true;
    resetPhoneFlow();
  });

  phoneCountryBtn?.addEventListener("click", () => {
    const codes = Object.keys(DIAL_BY_COUNTRY);
    const idx = codes.indexOf(phoneCountry);
    syncPhoneCountry(codes[(idx + 1) % codes.length]);
    resetPhoneFlow();
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
        showError(emailError, err.message || t("account_err_generic"));
      }
      return;
    }

    const phone = fullPhoneNumber(fd.get("phone"));
    try {
      if (!phoneCodeSent) {
        const res = await PaintApi.sendPhoneCode(phone);
        phoneCodeSent = true;
        phoneCodeBlock?.classList.remove("pm-account-hidden");
        if (res.devCode && authForm.elements.code) {
          authForm.elements.code.value = res.devCode;
        }
        updateAuthUi();
        return;
      }
      const data = await PaintApi.verifyPhoneCode(phone, fd.get("code"));
      afterLogin(data);
    } catch (err) {
      if (err?.data?.needsRegistration) {
        handleNeedsRegistration(null);
        oauthRegister.href = `/paint/register.html?phone=${encodeURIComponent(phone)}`;
      } else {
        showError(phoneError, err.message || t("account_err_generic"));
      }
    }
  });

  document.addEventListener("paint-market-country-change", (e) => {
    syncPhoneCountry(e.detail?.code || readStoredCountry());
    resetPhoneFlow();
  });

  (async function boot() {
    syncPhoneCountry(readStoredCountry());
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
