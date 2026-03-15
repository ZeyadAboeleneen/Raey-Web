"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Award, Heart, Sparkles, Instagram, Facebook } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useLocale } from "@/lib/locale-context"
import { useTranslation } from "@/lib/translations"

export default function AboutPage() {
  const { settings } = useLocale()
  const t = useTranslation(settings.language)
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 md:pt-28 pb-20 bg-gradient-to-b from-gray-50 via-white to-gray-50">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16 max-w-4xl mx-auto"
          >
            <Link href="/" className={`inline-flex items-center text-gray-600 hover:text-black mb-8 transition-colors ${settings.language === "ar" ? "flex-row-reverse" : ""}`}>
              <ArrowLeft className={`h-4 w-4 ${settings.language === "ar" ? "ml-2 rotate-180" : "mr-2"}`} />
              {t("backToHome")}
            </Link>
            <h1 className="text-4xl md:text-5xl font-light tracking-[0.35em] font-serif uppercase mb-6">{t("ourStory")}</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              {t("aboutHeroDesc")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <div className="mb-12">
                <h2 className="text-3xl font-light tracking-wider font-serif mb-6">{t("newChapter")}</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t("newChapterDesc1")}
                </p>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t("newChapterDesc2")}
                </p>
                <p className="text-gray-600 leading-relaxed">
                  {t("newChapterDesc3")}
                </p>
              </div>

              <div>
                <h2 className="text-3xl font-light tracking-wider font-serif mb-6">{t("ourPhilosophy")}</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t("philosophyDesc1")}
                </p>
                <p className="text-gray-600 leading-relaxed">
                  {t("philosophyDesc2")}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <Image
                src="/elraey-bg.PNG"
                alt="Raey Brand"
                width={800}
                height={1000}
                className="w-full h-[600px] object-cover rounded-lg shadow-lg"
                priority
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-light tracking-wider font-serif mb-6">{t("ourValues")}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              {t("valuesDesc")}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
                <Award className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-medium font-serif tracking-wide mb-4">{t("excellence")}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t("excellenceDesc")}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
                <Heart className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-medium font-serif tracking-wide mb-4">{t("passion")}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t("passionDesc")}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-medium font-serif tracking-wide mb-4">{t("innovation")}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t("innovationDesc")}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-light tracking-wider font-serif mb-6">{t("experienceOurCraft")}</h2>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              {t("experienceDesc")}
            </p>
            <Link href="/soiree/products">
              <Button size="lg" className="bg-black text-white hover:bg-gray-800 px-8 py-3">
                {t("exploreCollectionsButton")}
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}
