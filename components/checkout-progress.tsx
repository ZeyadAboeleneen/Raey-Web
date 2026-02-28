"use client"

import { CheckCircle, Circle, CreditCard, MapPin, User, ShoppingBag } from "lucide-react"
import { motion } from "framer-motion"

interface CheckoutStep {
  id: number
  title: string
  icon: any
  completed: boolean
  current: boolean
}

interface CheckoutProgressProps {
  currentStep: number
  className?: string
}

export const CheckoutProgress = ({ currentStep, className = "" }: CheckoutProgressProps) => {
  const steps: CheckoutStep[] = [
    { 
      id: 1, 
      title: "Details", 
      icon: User, 
      completed: currentStep > 1, 
      current: currentStep === 1 
    },
    { 
      id: 2, 
      title: "Checkout", 
      icon: CreditCard, 
      completed: currentStep > 2, 
      current: currentStep === 2 
    },
    { 
      id: 3, 
      title: "Confirmation", 
      icon: CheckCircle, 
      completed: currentStep > 3, 
      current: currentStep === 3 
    },
  ]

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className={`w-full max-w-4xl mx-auto mb-6 sm:mb-8 ${className}`}
    >
      {/* Progress Bar Container */}
      <div className="relative">
        {/* Background Progress Bar */}
        <div className="w-full h-3 bg-gray-200 rounded-full" />
        
        {/* Filled Progress Bar */}
        <motion.div 
          className="absolute top-0 left-0 h-3 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, (currentStep - 1) / (steps.length - 1)) * 100}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        
        {/* Step Circles with Numbers */}
        <div className="absolute top-0 left-0 w-full h-3 flex justify-between items-center px-1">
          {steps.map((step, index) => (
            <motion.div 
              key={step.id} 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                step.id <= currentStep 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-2 border-white shadow-lg' 
                  : 'bg-gray-300 text-gray-600 border-2 border-white'
              }`}
            >
              {step.id}
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Step Labels */}
      <div className="flex justify-between mt-4">
        {steps.map((step, index) => (
          <motion.div 
            key={step.id} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
            className={`text-sm font-medium text-center transition-colors duration-300 ${
              step.id <= currentStep 
                ? 'text-purple-600' 
                : 'text-gray-500'
            }`}
          >
            {step.title}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
