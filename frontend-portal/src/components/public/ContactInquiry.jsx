import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../../utils/whatsapp';

export default function ContactInquiry({ compact = false }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [inquiry, setInquiry] = useState({ name: '', phone: '', message: '' });

  const sendInquiry = (e) => {
    e.preventDefault();
    const lines = isAr
      ? [
          'استفسار من موقع المختبر',
          inquiry.name && `الاسم: ${inquiry.name}`,
          inquiry.phone && `الجوال: ${inquiry.phone}`,
          inquiry.message && `الرسالة: ${inquiry.message}`,
        ].filter(Boolean)
      : [
          'Inquiry from lab website',
          inquiry.name && `Name: ${inquiry.name}`,
          inquiry.phone && `Mobile: ${inquiry.phone}`,
          inquiry.message && `Message: ${inquiry.message}`,
        ].filter(Boolean);
    openWhatsApp(LAB_WHATSAPP_PHONE, lines.join('\n'));
  };

  return (
    <Card className="site-card border-border/70">
      <CardContent className={compact ? 'p-5' : 'p-6 sm:p-8'}>
        <h3 className="font-bold text-foreground mb-1">{t('home.inquiryTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-5">{t('home.inquiryHint')}</p>
        <form onSubmit={sendInquiry} className="space-y-4">
          <div>
            <Label htmlFor="inq-name">{t('home.inquiryName')}</Label>
            <Input
              id="inq-name"
              value={inquiry.name}
              onChange={(e) => setInquiry((s) => ({ ...s, name: e.target.value }))}
              className="mt-1.5"
              placeholder={t('home.inquiryNamePh')}
            />
          </div>
          <div>
            <Label htmlFor="inq-phone">{t('home.inquiryPhone')}</Label>
            <Input
              id="inq-phone"
              type="tel"
              dir="ltr"
              value={inquiry.phone}
              onChange={(e) => setInquiry((s) => ({ ...s, phone: e.target.value }))}
              className="mt-1.5"
              placeholder="05xxxxxxxx"
            />
          </div>
          <div>
            <Label htmlFor="inq-msg">{t('home.inquiryMessage')}</Label>
            <textarea
              id="inq-msg"
              rows={compact ? 2 : 3}
              value={inquiry.message}
              onChange={(e) => setInquiry((s) => ({ ...s, message: e.target.value }))}
              className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('home.inquiryMessagePh')}
            />
          </div>
          <Button type="submit" className="w-full gap-2">
            <MessageCircle size={16} />
            {t('home.inquirySend')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
