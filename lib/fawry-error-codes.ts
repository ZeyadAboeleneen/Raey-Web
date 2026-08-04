/**
 * FawryPay decline/error codes, as documented by Fawry.
 * Source: FawryPay "Error Codes" documentation page (customer-supplied).
 *
 * Used to show the customer a specific, actionable reason on the checkout
 * success/failure page instead of a generic "payment not completed" message.
 */
export interface FawryErrorMessage {
  en: string
  ar: string
}

export const FAWRY_ERROR_CODES: Record<string, FawryErrorMessage> = {
  "99901": {
    en: "The transaction is refused by the issuing bank. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك مصدر البطاقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99903": {
    en: "Incorrect transaction details, or the merchant terminal is inactive.",
    ar: "لقد تم رفض العملية مبيانات العملية غير صحيحة او حساب التاجر لدى البنك غير مفعل",
  },
  "99904": {
    en: "The issuing bank refused the transaction because the card is reported lost or stolen. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك حيث ان البطاقة ضائعة او مسروقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99905": {
    en: "The issuing bank is unwilling to accept this transaction. Try another card or contact your bank for details.",
    ar: "البنك المصدر غير راغب في قبول المعاملة. اطلب من العميل استخدام بطاقة اخرى او الاتصال بالبنك لمزيد من التفاصيل",
  },
  "99906": {
    en: "The card was incorrectly flagged as fraudulent. Please contact your issuing bank.",
    ar: "البطاقة المستخدمة يمكن ان تكون احتيالية. يرجى الاتصال بالبنك المصدر",
  },
  "99907": {
    en: "The issuing bank declined this transaction. Please contact your bank to resolve this issue.",
    ar: "البطاقة المستخدمة يمكن ان تكون احتيالية. يرجى الاتصال بالبنك المصدر",
  },
  "99908": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99910": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99912": {
    en: "An error occurred while processing the card. Please try again or use another card.",
    ar: "حدث خطأ أثناء معالجة البطاقة. تأكد من تكوين المدفوعات بشكل صحيح",
  },
  "99913": {
    en: "Incorrect transaction amount. Please make sure to enter a valid amount.",
    ar: "مبلغ المعاملة غير صحيح، يرجى التأكد من إدخال المبلغ بشكل صحيح",
  },
  "99914": {
    en: "Please make sure the card number is valid and try again.",
    ar: "برجاء التحقق من رقم الكارت المستخدم وحاول مرة اخرى",
  },
  "99915": {
    en: "The card issuer could not be identified. Double-check the card number and try again.",
    ar: "جهة إصدار بطاقة العميل غير موجودة. تحقق من رقم البطاقة وحاول مرة أخرى",
  },
  "99922": {
    en: "The issuing bank is not responding. Please try again.",
    ar: "البنك المصدر لا يستجيب أثناء المعاملة. حاول مرة اخرى",
  },
  "99930": {
    en: "There is a configuration issue with the merchant account.",
    ar: "تحقق من اعدادات حساب التاجر الخاص بك",
  },
  "99931": {
    en: "The issuing bank declined the transaction — this card isn't allowed for this service.",
    ar: "تم رفض العملية من قبل البنك مصدر البطاقة حيث ان الخدمة غير متاحة للبطاقة المستخدمة",
  },
  "99934": {
    en: "The transaction was declined due to suspected fraud on this card.",
    ar: "تم رفض المعاملة من قبل البنك المصدر لوجود احتيال مشتبه به على رقم البطاقة المستخدمة",
  },
  "99937": {
    en: "The transaction is refused by the issuing bank. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك مصدر البطاقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99939": {
    en: "The transaction is refused by the issuing bank. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك مصدر البطاقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99941": {
    en: "This card is reported as lost.",
    ar: "تم الإبلاغ عن البطاقة المستخدمة على أنها مفقودة",
  },
  "99942": {
    en: "This card isn't allowed to perform this kind of transaction. Please try another card.",
    ar: "لا يمكن اتمام العملية بالبطاقة المستخدمة. يرجى استخدام بطاقة اخرى واعادة المحاولة",
  },
  "99943": {
    en: "This card is reported as stolen.",
    ar: "تم الإبلاغ عن البطاقة المستخدمة على أنها مسروقة",
  },
  "99949": {
    en: "Your issuing bank declined the transaction — this card isn't allowed for online transactions.",
    ar: "رفض البنك المُصدر للمعاملة لأن البطاقة غير مسموح بها للمعاملات عبر الإنترنت",
  },
  "99951": {
    en: "Insufficient card funds to complete this transaction.",
    ar: "رصيد البطاقة غير كاف لاتمام هذه العملية",
  },
  "99954": {
    en: "This card has expired. Please use another card.",
    ar: "انتهت صلاحية البطاقة ولم تعد صالحة للاستخدام. الرجاء استخدام بطاقة أخرى",
  },
  "99955": {
    en: "The card PIN entered is incorrect. Please try again with the correct PIN.",
    ar: "تم رفض العملية لادخالك رقم سرى خطأ. برجاء المحاولة بعد التأكد من الرقم السرى الصحيح",
  },
  "99956": {
    en: "The issuing bank declined the transaction — the card number doesn't exist. Please try another card.",
    ar: "تم رفض العملية حيث ان رقم البطاقة غير موجود. الرجاء محاولة بطاقة أخرى",
  },
  "99957": {
    en: "The issuing bank declined the transaction — this card isn't allowed for this service.",
    ar: "تم رفض العملية من قبل البنك مصدر البطاقة حيث ان الخدمة غير متاحة للبطاقة المستخدمة",
  },
  "99958": {
    en: "There is a configuration issue with the merchant's payment processing account.",
    ar: "يوجد مشكلة فى حساب التاجر عند اجراء عمليات الدفع",
  },
  "99959": {
    en: "The transaction was declined because it appears fraudulent.",
    ar: "تم رفض المعاملة من قبل المُصدر لأنها تبدو احتيالية",
  },
  "99961": {
    en: "The issuing bank declined the transaction — it exceeds your card's limit.",
    ar: "تم رفض المعاملة لأنها ستتجاوز حد بطاقة العميل",
  },
  "99962": {
    en: "This card can't be used in this region or country.",
    ar: "لا يمكن استخدام البطاقة فى هذه الدولة او المنطقة",
  },
  "99963": {
    en: "The issuing bank declined the transaction due to security checks. Please contact your bank.",
    ar: "تم رفض المعاملة لانها لم تتعدى تحققات الامان. برجاء الاتصال بالبنك لحل المشكلة",
  },
  "99965": {
    en: "The issuing bank declined the transaction — it exceeds your card's usual spending limit.",
    ar: "تم رفض المعاملة لأنها ستتجاوز حد بطاقة العميل المعتاد استخدامه",
  },
  "99967": {
    en: "The issuing bank declined the transaction — the card is suspected to be counterfeit.",
    ar: "تم رفض المعاملة من قبل البنك المصدر للاشتباه في أن البطاقة مزيفة",
  },
  "99970": {
    en: "The transaction is refused by the issuing bank. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك مصدر البطاقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99971": {
    en: "The issuing bank refused the transaction — the PIN hasn't been changed. Please contact your issuing bank.",
    ar: "لقد تم رفض العملية من قبل البنك مصدر البطاقة لانه لم يتم تغيير الرقم السرى. برجاء التواصل مع البنك الخاص بكم",
  },
  "99975": {
    en: "The transaction was refused — the PIN was entered incorrectly too many times. Please contact your bank.",
    ar: "تم رفض المعاملة حيث تم إدخال الرقم السرى بشكل خاطئ لأقصى عدد من المحاولات المسموح بها. برجاء التواصل مع البنك الخاص بكم",
  },
  "99976": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99977": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99978": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99979": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99980": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99981": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99984": {
    en: "The transaction failed on the issuing bank's side. Please contact your issuing bank.",
    ar: "لقد تعذر اتمام العملية من قبل البنك مصدر البطاقة. برجاء التواصل مع البنك الخاص بكم",
  },
  "99985": {
    en: "The transaction failed due to the amount used. Please try again with a different amount.",
    ar: "لقد فشلت العملية لمحاولة اتمامها بمبلغ غير مسموح به. برجاء المحاولة مرة اخرى بعد تعديل مبلغ العملية",
  },
  "99986": {
    en: "The transaction failed due to a technical error on the bank's side. Please try again later.",
    ar: "تعذر اتمام العملية نظرا لوجود خطأ تقنى من جانب البنك. برجاء المحاولة لاحقا",
  },
  "99987": {
    en: "This transaction could not be performed. Please try again later or use another card.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى او استخدام بطاقة اخرى",
  },
  "99988": {
    en: "The transaction failed due to a technical error on the bank's side. Please try again later.",
    ar: "تعذر اتمام العملية نظرا لوجود خطأ تقنى من جانب البنك. برجاء المحاولة لاحقا",
  },
  "99989": {
    en: "The transaction failed due to a technical error on the bank's side. Please try again later.",
    ar: "تعذر اتمام العملية نظرا لوجود خطأ تقنى من جانب البنك. برجاء المحاولة لاحقا",
  },
  "99991": {
    en: "There was a problem contacting the issuing bank to authorize this transaction. Please try again.",
    ar: "تعذر الاتصال بالبنك مصدر البطاقة. برجاء المحاولة مرة اخرى",
  },
  "99992": {
    en: "Unable to route this transaction. Please try again.",
    ar: "لا يمكن اتمام هذه العملية. برجاء المحاولة مرة اخرى",
  },
  "99994": {
    en: "The transaction failed due to a technical error. Please try again later.",
    ar: "تعذر اتمام العملية نظرا لوجود خطأ تقنى. برجاء المحاولة لاحقا",
  },
  "99996": {
    en: "The transaction failed due to a technical error. Please try again later.",
    ar: "تعذر اتمام العملية نظرا لوجود خطأ تقنى. برجاء المحاولة لاحقا",
  },
  "21010": {
    en: "The payment amount exceeds the allowed payment amount.",
    ar: "المبلغ المدفوع يتعدى المبلغ المسموح به",
  },
  "55006": {
    en: "An unauthorized payment card was used.",
    ar: "تم إستخدام بطاقة أئتمان / مدين غير مصرح بها",
  },
  "21004": {
    en: "There was a payment amount validation error.",
    ar: "المبلغ المستخدم غير صالح لعملية الدفع",
  },
}

/**
 * Looks up a Fawry status/error code. Returns null for codes not in the
 * table (e.g. 200 = success, or any code Fawry adds that isn't documented
 * here yet) so callers can fall back to a generic message.
 *
 * Fawry's actual return-URL statusCode is observed to be one digit shorter
 * than the codes in their own published table — e.g. the browser redirect
 * carries "9903" / "9949" while the documentation lists "99903" / "99949"
 * (confirmed against two live failures). Try the raw code first, then retry
 * with a leading "9" restored before giving up.
 */
export function getFawryErrorMessage(code: string | null | undefined): FawryErrorMessage | null {
  if (!code) return null
  const trimmed = code.trim()
  return FAWRY_ERROR_CODES[trimmed] || FAWRY_ERROR_CODES[`9${trimmed}`] || null
}
