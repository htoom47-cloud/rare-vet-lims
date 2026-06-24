import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      portal: {
        title: 'Client Portal',
        subtitle: 'View your laboratory reports',
        signIn: 'Sign in with mobile',
        mobileHint: 'Enter the mobile number registered with the laboratory',
        enterOtp: 'Enter verification code',
        otpHint: 'Enter the 6-digit code sent to your mobile',
        sendOtp: 'Send verification code',
        otpCode: 'Verification code',
        verifyAndLogin: 'Verify & sign in',
        changeMobile: 'Change mobile number',
        otpSent: 'Verification code sent',
        loginSuccess: 'Welcome!',
        loginFailed: 'Could not send verification code',
        mobileNotFound: 'No account found for this mobile number',
        invalidOtp: 'Invalid or expired verification code',
        otpCooldown: 'Please wait before requesting a new code',
        myReports: 'My Reports',
        reportsHint: 'All laboratory reports linked to your account',
        noReports: 'No reports available yet',
        loadFailed: 'Could not load reports',
        logout: 'Sign out',
        pwaTitle: 'Install the app',
        pwaAndroidHint: 'Add the client portal to your home screen for quick access.',
        pwaIosHint: 'Tap Share, then "Add to Home Screen" to install the app.',
        pwaInstall: 'Install app',
        pwaDismiss: 'Dismiss',
      },
      common: {
        loading: 'Loading...', date: 'Date', view: 'View', print: 'Print', download: 'Download',
      },
      customers: { mobile: 'Mobile' },
      animals: {
        animalId: 'Animal ID', type: 'Animal Type',
        types: { camel: 'Camel', horse: 'Horse', sheep: 'Sheep', goat: 'Goat', bird: 'Bird', cat: 'Cat', dog: 'Dog' },
      },
      reports: { sampleNo: 'Sample No.' },
      labReport: {
        back: 'Back', final: 'Final', preliminary: 'Preliminary',
        loadFailed: 'Could not load report', downloadPdf: 'Download PDF',
        downloadDone: 'PDF downloaded', downloadFailed: 'Download failed',
      },
    },
  },
  ar: {
    translation: {
      portal: {
        title: 'بوابة العميل',
        subtitle: 'اطّلع على تقاريرك المخبرية',
        signIn: 'الدخول برقم الجوال',
        mobileHint: 'أدخل رقم الجوال المسجل لدى المختبر',
        enterOtp: 'أدخل رمز التحقق',
        otpHint: 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى جوالك',
        sendOtp: 'إرسال رمز التحقق',
        otpCode: 'رمز التحقق',
        verifyAndLogin: 'تحقق وسجّل الدخول',
        changeMobile: 'تغيير رقم الجوال',
        otpSent: 'تم إرسال رمز التحقق',
        loginSuccess: 'مرحباً بك!',
        loginFailed: 'تعذّر إرسال رمز التحقق',
        mobileNotFound: 'لا يوجد حساب مسجل بهذا الرقم',
        invalidOtp: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
        otpCooldown: 'يرجى الانتظار قبل طلب رمز جديد',
        myReports: 'تقاريري',
        reportsHint: 'جميع التقارير المرتبطة بحسابك',
        noReports: 'لا توجد تقارير متاحة حالياً',
        loadFailed: 'تعذّر تحميل التقارير',
        logout: 'تسجيل الخروج',
        pwaTitle: 'ثبّت التطبيق',
        pwaAndroidHint: 'أضف بوابة العميل إلى الشاشة الرئيسية للوصول السريع.',
        pwaIosHint: 'اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» لتثبيت التطبيق.',
        pwaInstall: 'تثبيت التطبيق',
        pwaDismiss: 'إغلاق',
      },
      common: {
        loading: 'جاري التحميل...', date: 'التاريخ', view: 'عرض', print: 'طباعة', download: 'تحميل',
      },
      customers: { mobile: 'الجوال' },
      animals: {
        animalId: 'رقم الحيوان', type: 'نوع الحيوان',
        types: { camel: 'جمل', horse: 'حصان', sheep: 'غنم', goat: 'ماعز', bird: 'طائر', cat: 'قط', dog: 'كلب' },
      },
      reports: { sampleNo: 'رقم العينة' },
      labReport: {
        back: 'رجوع', final: 'نهائي', preliminary: 'مبدئي',
        loadFailed: 'تعذّر تحميل التقرير', downloadPdf: 'تحميل PDF',
        downloadDone: 'تم التحميل', downloadFailed: 'فشل التحميل',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('language') || 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
