"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Instagram, Mail, Phone } from "lucide-react"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

export function Footer() {
  const { settings } = useLocale()
  const t = useTranslation(settings.language)

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 1.2 }}
      viewport={{ once: true, amount: 0.3 }}
      className="bg-rose-50 text-gray-900 py-12"
    >
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-8">
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <Image
              src="/raey-logo-black.png"
              alt="Raey Logo"
              width={864}
              height={288}
              className="h-24 w-auto"
            />
            <p className="text-rose-700 text-sm">
              {t("footerDesc")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <h3 className="font-bold mb-4">{t("navigation")}</h3>
            <div className="space-y-2 text-sm">
              <Link href="/" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("home")}
              </Link>
              <Link href="/about" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("about")}
              </Link>
              <Link href="/products" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("collections")}
              </Link>
              <Link href="/contact" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("contact")}
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h3 className="font-bold mb-4">{t("collectionsFooter")}</h3>
            <div className="space-y-2 text-sm">
              <Link href="/products/mona-saleh" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("monaSalehCollection")}
              </Link>
              <Link href="/products/el-raey-1" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("elRaey1Collection")}
              </Link>
              <Link href="/products/el-raey-2" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("elRaey2Collection")}
              </Link>
              <Link href="/products/el-raey-the-yard" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("elRaeyTheYardCollection")}
              </Link>
              <Link href="/products/sell-dresses" className="block text-rose-700 hover:text-rose-900 transition-colors">
                {t("sellDressesCollection")}
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
          >
            <h3 className="font-bold mb-4">{t("contact")}</h3>
            <div className="space-y-2 text-sm text-rose-700">
              <p>Email: {t("contactEmail")}</p>
              <p>WhatsApp: {t("phoneWhatsAppDisplay")}</p>
              <p className="mb-3">{t("followMaison")}</p>
              <div className="flex space-x-3">
                <Link
                  href={`mailto:${t("contactEmail")}`}
                  className="group"
                >
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                    <Mail className="h-4 w-4 text-white" />
                  </div>
                </Link>
                <Link
                  href={`https://wa.me/${t("phoneWhatsApp")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                    <Phone className="h-4 w-4 text-white" />
                  </div>
                </Link>
                <Link
                  href={t("instagramLink")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                    <Instagram className="h-4 w-4 text-white" />
                  </div>
                </Link>
                <Link
                  href={t("tiktokLink")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                    </svg>
                  </div>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="border-t border-rose-200 mt-8 pt-8 text-center text-sm text-rose-700"
        >
          <p>
            &copy; 2026 Raey Atelier. All rights reserved. |
            <span className="text-rose-600"> Made by </span>
            <a
              href="https://www.instagram.com/digitiva.co?igsh=MXNteGgyZjIzenQwaQ=="
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-600 hover:text-rose-900 transition-colors"
            >
              Digitiva
            </a>
          </p>
        </motion.div>
      </div>
    </motion.footer>
  )
}
