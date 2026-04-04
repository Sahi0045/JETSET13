/**
 * resources/js/utils/i18n.js
 * Phase 8 — Internationalisation
 * Lightweight i18n system — no external packages required.
 * Supports: en, fr, ar (RTL), es, zh
 */

// ─── Supported languages ──────────────────────────────────────
export const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧', rtl: false },
  { code: 'fr', label: 'Français',   flag: '🇫🇷', rtl: false },
  { code: 'es', label: 'Español',    flag: '🇪🇸', rtl: false },
  { code: 'ar', label: 'العربية',    flag: '🇸🇦', rtl: true  },
  { code: 'zh', label: '中文',        flag: '🇨🇳', rtl: false },
];

// ─── Translations ─────────────────────────────────────────────
const translations = {
  en: {
    nav: {
      home: 'Home', flights: 'Flights', hotels: 'Hotels',
      cruises: 'Cruises', packages: 'Packages', visa: 'Visa Services',
      login: 'Login', signup: 'Sign Up', myTrips: 'My Trips', logout: 'Logout',
    },
    common: {
      search: 'Search', book: 'Book Now', cancel: 'Cancel', confirm: 'Confirm',
      loading: 'Loading…', error: 'Something went wrong', retry: 'Try Again',
      save: 'Save', edit: 'Edit', delete: 'Delete', back: 'Back', next: 'Next',
      submit: 'Submit', close: 'Close', view: 'View Details', download: 'Download',
      contact: 'Contact Us', support: 'Support', faq: 'FAQs',
    },
    visa: {
      title: 'Visa Services', apply: 'Apply Now', track: 'Track Application',
      requirements: 'Requirements', documents: 'Documents Needed',
      processing: 'Processing Time', status: 'Application Status',
      pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
      inProgress: 'In Progress',
    },
    booking: {
      departure: 'Departure', arrival: 'Arrival', passengers: 'Passengers',
      class: 'Class', economy: 'Economy', business: 'Business', first: 'First Class',
      roundTrip: 'Round Trip', oneWay: 'One Way', checkIn: 'Check-in', checkOut: 'Check-out',
      guests: 'Guests', rooms: 'Rooms', nights: 'Nights', total: 'Total',
    },
    auth: {
      email: 'Email Address', password: 'Password', firstName: 'First Name',
      lastName: 'Last Name', forgotPassword: 'Forgot Password?',
      resetPassword: 'Reset Password', signIn: 'Sign In', signUp: 'Sign Up',
      orContinueWith: 'Or continue with', alreadyHaveAccount: 'Already have an account?',
      dontHaveAccount: "Don't have an account?",
    },
    gdpr: {
      title: 'Privacy & Data', exportData: 'Export My Data', deleteAccount: 'Delete My Account',
      consentMarketing: 'Marketing emails', consentAnalytics: 'Usage analytics',
      consentCookies: 'Cookie tracking', manage: 'Manage Preferences',
      deleteWarning: 'This will permanently delete your account. This action cannot be undone.',
    },
  },
  fr: {
    nav: {
      home: 'Accueil', flights: 'Vols', hotels: 'Hôtels',
      cruises: 'Croisières', packages: 'Forfaits', visa: 'Services Visa',
      login: 'Connexion', signup: "S'inscrire", myTrips: 'Mes Voyages', logout: 'Déconnexion',
    },
    common: {
      search: 'Rechercher', book: 'Réserver', cancel: 'Annuler', confirm: 'Confirmer',
      loading: 'Chargement…', error: "Une erreur s'est produite", retry: 'Réessayer',
      save: 'Sauvegarder', edit: 'Modifier', delete: 'Supprimer', back: 'Retour', next: 'Suivant',
      submit: 'Soumettre', close: 'Fermer', view: 'Voir les détails', download: 'Télécharger',
      contact: 'Contactez-nous', support: 'Support', faq: 'FAQ',
    },
    visa: {
      title: 'Services Visa', apply: 'Demander maintenant', track: 'Suivre la demande',
      requirements: 'Exigences', documents: 'Documents requis',
      processing: 'Délai de traitement', status: 'Statut de la demande',
      pending: 'En attente', approved: 'Approuvé', rejected: 'Refusé', inProgress: 'En cours',
    },
    booking: {
      departure: 'Départ', arrival: 'Arrivée', passengers: 'Passagers',
      class: 'Classe', economy: 'Économique', business: 'Affaires', first: 'Première classe',
      roundTrip: 'Aller-retour', oneWay: 'Aller simple', checkIn: 'Arrivée', checkOut: 'Départ',
      guests: 'Clients', rooms: 'Chambres', nights: 'Nuits', total: 'Total',
    },
    auth: {
      email: 'Adresse email', password: 'Mot de passe', firstName: 'Prénom',
      lastName: 'Nom', forgotPassword: 'Mot de passe oublié ?',
      resetPassword: 'Réinitialiser', signIn: 'Se connecter', signUp: "S'inscrire",
      orContinueWith: 'Ou continuer avec', alreadyHaveAccount: 'Déjà un compte ?',
      dontHaveAccount: 'Pas encore de compte ?',
    },
    gdpr: {
      title: 'Confidentialité', exportData: 'Exporter mes données', deleteAccount: 'Supprimer mon compte',
      consentMarketing: 'Emails marketing', consentAnalytics: "Analyses d'utilisation",
      consentCookies: 'Suivi des cookies', manage: 'Gérer les préférences',
      deleteWarning: 'Ceci supprimera définitivement votre compte.',
    },
  },
  es: {
    nav: {
      home: 'Inicio', flights: 'Vuelos', hotels: 'Hoteles',
      cruises: 'Cruceros', packages: 'Paquetes', visa: 'Servicios de Visa',
      login: 'Iniciar sesión', signup: 'Registrarse', myTrips: 'Mis Viajes', logout: 'Cerrar sesión',
    },
    common: {
      search: 'Buscar', book: 'Reservar', cancel: 'Cancelar', confirm: 'Confirmar',
      loading: 'Cargando…', error: 'Algo salió mal', retry: 'Intentar de nuevo',
      save: 'Guardar', edit: 'Editar', delete: 'Eliminar', back: 'Atrás', next: 'Siguiente',
      submit: 'Enviar', close: 'Cerrar', view: 'Ver detalles', download: 'Descargar',
      contact: 'Contáctenos', support: 'Soporte', faq: 'Preguntas frecuentes',
    },
    visa: {
      title: 'Servicios de Visa', apply: 'Solicitar ahora', track: 'Rastrear solicitud',
      requirements: 'Requisitos', documents: 'Documentos necesarios',
      processing: 'Tiempo de procesamiento', status: 'Estado de solicitud',
      pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', inProgress: 'En progreso',
    },
    booking: {
      departure: 'Salida', arrival: 'Llegada', passengers: 'Pasajeros',
      class: 'Clase', economy: 'Económica', business: 'Negocios', first: 'Primera clase',
      roundTrip: 'Ida y vuelta', oneWay: 'Solo ida', checkIn: 'Entrada', checkOut: 'Salida',
      guests: 'Huéspedes', rooms: 'Habitaciones', nights: 'Noches', total: 'Total',
    },
    auth: {
      email: 'Correo electrónico', password: 'Contraseña', firstName: 'Nombre',
      lastName: 'Apellido', forgotPassword: '¿Olvidó su contraseña?',
      resetPassword: 'Restablecer contraseña', signIn: 'Iniciar sesión', signUp: 'Registrarse',
      orContinueWith: 'O continuar con', alreadyHaveAccount: '¿Ya tienes cuenta?',
      dontHaveAccount: '¿No tienes cuenta?',
    },
    gdpr: {
      title: 'Privacidad', exportData: 'Exportar mis datos', deleteAccount: 'Eliminar mi cuenta',
      consentMarketing: 'Correos de marketing', consentAnalytics: 'Análisis de uso',
      consentCookies: 'Seguimiento de cookies', manage: 'Gestionar preferencias',
      deleteWarning: 'Esto eliminará tu cuenta permanentemente.',
    },
  },
  ar: {
    nav: {
      home: 'الرئيسية', flights: 'الرحلات', hotels: 'الفنادق',
      cruises: 'الرحلات البحرية', packages: 'الباقات', visa: 'خدمات التأشيرة',
      login: 'تسجيل الدخول', signup: 'إنشاء حساب', myTrips: 'رحلاتي', logout: 'تسجيل الخروج',
    },
    common: {
      search: 'بحث', book: 'احجز الآن', cancel: 'إلغاء', confirm: 'تأكيد',
      loading: 'جارٍ التحميل…', error: 'حدث خطأ ما', retry: 'حاول مرة أخرى',
      save: 'حفظ', edit: 'تعديل', delete: 'حذف', back: 'رجوع', next: 'التالي',
      submit: 'إرسال', close: 'إغلاق', view: 'عرض التفاصيل', download: 'تحميل',
      contact: 'اتصل بنا', support: 'الدعم', faq: 'الأسئلة الشائعة',
    },
    visa: {
      title: 'خدمات التأشيرة', apply: 'تقدم الآن', track: 'تتبع الطلب',
      requirements: 'المتطلبات', documents: 'المستندات المطلوبة',
      processing: 'وقت المعالجة', status: 'حالة الطلب',
      pending: 'قيد الانتظار', approved: 'موافق عليه', rejected: 'مرفوض', inProgress: 'قيد المعالجة',
    },
    booking: {
      departure: 'المغادرة', arrival: 'الوصول', passengers: 'الركاب',
      class: 'الدرجة', economy: 'اقتصادية', business: 'رجال الأعمال', first: 'الدرجة الأولى',
      roundTrip: 'ذهاب وإياب', oneWay: 'اتجاه واحد', checkIn: 'تسجيل الوصول', checkOut: 'تسجيل المغادرة',
      guests: 'الضيوف', rooms: 'الغرف', nights: 'الليالي', total: 'المجموع',
    },
    auth: {
      email: 'البريد الإلكتروني', password: 'كلمة المرور', firstName: 'الاسم الأول',
      lastName: 'اسم العائلة', forgotPassword: 'نسيت كلمة المرور؟',
      resetPassword: 'إعادة تعيين', signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب',
      orContinueWith: 'أو المتابعة باستخدام', alreadyHaveAccount: 'هل لديك حساب بالفعل؟',
      dontHaveAccount: 'ليس لديك حساب؟',
    },
    gdpr: {
      title: 'الخصوصية والبيانات', exportData: 'تصدير بياناتي', deleteAccount: 'حذف حسابي',
      consentMarketing: 'رسائل تسويقية', consentAnalytics: 'تحليلات الاستخدام',
      consentCookies: 'تتبع ملفات تعريف الارتباط', manage: 'إدارة التفضيلات',
      deleteWarning: 'سيؤدي ذلك إلى حذف حسابك نهائياً.',
    },
  },
  zh: {
    nav: {
      home: '首页', flights: '航班', hotels: '酒店',
      cruises: '邮轮', packages: '套餐', visa: '签证服务',
      login: '登录', signup: '注册', myTrips: '我的行程', logout: '退出',
    },
    common: {
      search: '搜索', book: '立即预订', cancel: '取消', confirm: '确认',
      loading: '加载中…', error: '发生错误', retry: '重试',
      save: '保存', edit: '编辑', delete: '删除', back: '返回', next: '下一步',
      submit: '提交', close: '关闭', view: '查看详情', download: '下载',
      contact: '联系我们', support: '客户支持', faq: '常见问题',
    },
    visa: {
      title: '签证服务', apply: '立即申请', track: '追踪申请',
      requirements: '要求', documents: '所需文件',
      processing: '处理时间', status: '申请状态',
      pending: '待处理', approved: '已批准', rejected: '已拒绝', inProgress: '处理中',
    },
    booking: {
      departure: '出发', arrival: '到达', passengers: '乘客',
      class: '舱位', economy: '经济舱', business: '商务舱', first: '头等舱',
      roundTrip: '往返', oneWay: '单程', checkIn: '入住', checkOut: '退房',
      guests: '房客', rooms: '客房', nights: '晚', total: '合计',
    },
    auth: {
      email: '电子邮件', password: '密码', firstName: '名',
      lastName: '姓', forgotPassword: '忘记密码？',
      resetPassword: '重置密码', signIn: '登录', signUp: '注册',
      orContinueWith: '或通过以下方式继续', alreadyHaveAccount: '已有账户？',
      dontHaveAccount: '没有账户？',
    },
    gdpr: {
      title: '隐私与数据', exportData: '导出我的数据', deleteAccount: '删除我的账户',
      consentMarketing: '营销邮件', consentAnalytics: '使用分析',
      consentCookies: 'Cookie追踪', manage: '管理偏好设置',
      deleteWarning: '这将永久删除您的账户。',
    },
  },
};

// ─── i18n State ───────────────────────────────────────────────
const STORAGE_KEY = 'jetset_lang';

let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';
const listeners = new Set();

function notifyListeners() {
  listeners.forEach(fn => fn(currentLang));
}

// ─── Public API ───────────────────────────────────────────────
export function setLanguage(code) {
  if (!translations[code]) return;
  currentLang = code;
  localStorage.setItem(STORAGE_KEY, code);

  // RTL support
  const lang = LANGUAGES.find(l => l.code === code);
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', lang?.rtl ? 'rtl' : 'ltr');

  notifyListeners();
}

export function getLanguage() {
  return currentLang;
}

/**
 * Translate a dot-notated key, e.g. t('nav.home') => 'Home'
 * Placeholders: t('booking.seats', { count: 2 }) — replace {{count}}
 */
export function t(key, vars = {}) {
  const keys   = key.split('.');
  let value = translations[currentLang];

  for (const k of keys) {
    if (value == null) break;
    value = value[k];
  }

  // Fallback to English
  if (value == null) {
    value = translations['en'];
    for (const k of keys) {
      if (value == null) break;
      value = value[k];
    }
  }

  if (typeof value !== 'string') return key;

  // Replace {{variable}} placeholders
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v),
    value
  );
}

/**
 * Subscribe to language changes.
 * Returns unsubscribe function.
 */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Init dir attribute on load
setLanguage(currentLang);
