'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COUNTRIES = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية', rtl: true },
];

export function CountryLanguageSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);

  // Load saved preferences from localStorage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCountry = localStorage.getItem('selectedCountry');
      const savedLanguage = localStorage.getItem('selectedLanguage');
      
      if (savedCountry) {
        const country = JSON.parse(savedCountry);
        setSelectedCountry(country);
      }
      
      if (savedLanguage) {
        const language = JSON.parse(savedLanguage);
        setSelectedLanguage(language);
      }
    }
  }, []);

  const handleCountrySelect = (country: typeof COUNTRIES[0]) => {
    setSelectedCountry(country);
    localStorage.setItem('selectedCountry', JSON.stringify(country));
    // Here you would typically update the currency context or make an API call
  };

  const handleLanguageSelect = (language: typeof LANGUAGES[0]) => {
    setSelectedLanguage(language);
    localStorage.setItem('selectedLanguage', JSON.stringify(language));
    // Here you would typically update the i18n context
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-center mb-2">
            <Globe className="w-8 h-8 mr-2" />
            <h2 className="text-2xl font-bold">Welcome</h2>
          </div>
          <p className="text-center text-indigo-100">
            Select your country and preferred language to see local pricing and shipping options.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Country Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country
            </label>
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  <span className={`fi fi-${selectedCountry.code.toLowerCase()} mr-3`}></span>
                  <span>{selectedCountry.name} ({selectedCountry.currency})</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                  >
                    <div className="max-h-60 overflow-y-auto">
                      {COUNTRIES.map((country) => (
                        <button
                          key={country.code}
                          onClick={() => {
                            handleCountrySelect(country);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-4 py-3 flex items-center hover:bg-gray-50 transition-colors",
                            selectedCountry.code === country.code ? "bg-indigo-50 text-indigo-700" : "text-gray-800"
                          )}
                        >
                          <span className={`fi fi-${country.code.toLowerCase()} mr-3`}></span>
                          <span className="flex-1">{country.name} ({country.currency})</span>
                          {selectedCountry.code === country.code && (
                            <Check className="w-5 h-5 text-indigo-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Language Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  onClick={() => handleLanguageSelect(language)}
                  className={cn(
                    "p-3 border rounded-lg transition-all flex items-center justify-center",
                    selectedLanguage.code === language.code
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-300 hover:border-gray-400 bg-white text-gray-700"
                  )}
                  dir={language.rtl ? 'rtl' : 'ltr'}
                >
                  {language.name}
                  {selectedLanguage.code === language.code && (
                    <Check className="w-4 h-4 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <Button 
              onClick={() => {
                // Handle continue action
                console.log('Selected:', { country: selectedCountry, language: selectedLanguage });
              }}
              className="w-full py-6 text-base font-medium bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all transform hover:scale-[1.02]"
            >
              Continue to Store
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            You can change these settings anytime in your account preferences.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
