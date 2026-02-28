"use client"

import React from "react"
import { useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tag, Shield, Truck, Package, ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { useCurrencyFormatter } from "@/hooks/use-currency"

interface OrderSummaryProps {
  items: Array<{
    id: string
    name: string
    price: number
    originalPrice?: number
    size: string
    quantity: number
    image?: string
    isGiftPackage?: boolean
    packageDetails?: {
      totalSizes: number
      packagePrice: number
      sizes: Array<{
        size: string
        volume: string
        selectedProduct: {
          productId: string
          productName: string
          productImage: string
          productDescription: string
        }
      }>
    }
  }>
  subtotal: number
  total: number
  discountCode: string
  setDiscountCode: (code: string) => void
  appliedDiscount: any
  discountError: string
  discountLoading: boolean
  onApplyDiscount: () => void
  onRemoveDiscount: () => void
  onSubmit: (e?: React.FormEvent<HTMLFormElement>) => void
  loading: boolean
  governorate: string
  formError?: string
}

export const OrderSummary = ({
  items,
  subtotal,
  total,
  discountCode,
  setDiscountCode,
  appliedDiscount,
  discountError,
  discountLoading,
  onApplyDiscount,
  onRemoveDiscount,
  onSubmit,
  loading,
  governorate,
  formError
}: OrderSummaryProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { formatPrice } = useCurrencyFormatter()

  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden">
      <motion.div 
        className="absolute -inset-4 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-lg -z-10"
        animate={{
          rotate: [0, 1, 0, -1, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div 
        className="absolute -inset-2 bg-gradient-to-r from-purple-300/30 to-pink-300/30 rounded-lg -z-10"
        animate={{
          rotate: [0, -0.5, 0, 0.5, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <CardHeader className="pb-4">
        <CardTitle className="text-lg sm:text-xl flex items-center">
          <Package className="mr-2 h-5 w-5 text-purple-600" />
          Order Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mobile Expandable Items */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="flex items-center justify-between w-full p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg hover:from-purple-100 hover:to-pink-100 transition-all duration-300"
          >
            <span className="text-sm font-medium text-purple-800">
              {items.length} item{items.length !== 1 ? 's' : ''} in cart
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-purple-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-purple-600" />
            )}
          </button>
          
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-3 space-y-3 max-h-64 overflow-y-auto"
            >
              {items.map((item) => (
                <div key={item.id} className="flex items-center space-x-3 p-2 bg-white rounded border border-purple-100 hover:border-purple-300 transition-colors">
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <Image
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      fill
                      className="object-cover rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-600">
                      {item.size} • Qty: {item.quantity}
                    </p>
                    
                    {/* Gift Package Details */}
                    {item.isGiftPackage && item.packageDetails && (
                      <div className="mt-1 text-xs text-gray-500">
                        <div className="flex items-center space-x-1 mb-1">
                          <Package className="h-3 w-3" />
                          <span>Package Contents:</span>
                        </div>
                        <div className="space-y-1 ml-4">
                          {item.packageDetails.sizes.map((sizeInfo: any, sizeIndex: number) => (
                            <div key={sizeIndex} className="flex items-center space-x-1">
                              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                              <span>{sizeInfo.size}: {sizeInfo.selectedProduct.productName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-medium text-right">
                    {item.originalPrice && item.originalPrice > item.price ? (
                      <>
                        <div className="line-through text-gray-400 text-xs">
                          {formatPrice(item.originalPrice * item.quantity)}
                        </div>
                        <div className="text-red-600 font-bold">
                          {formatPrice(item.price * item.quantity)}
                        </div>
                      </>
                    ) : (
                      <div>{formatPrice(item.price * item.quantity)}</div>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Desktop Items */}
        <div className="hidden sm:block space-y-3 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-purple-50 transition-colors">
              <div className="relative w-12 h-12 flex-shrink-0">
                <Image
                  src={item.image || "/placeholder.svg"}
                  alt={item.name}
                  fill
                  className="object-cover rounded"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-gray-600">
                  {item.size} • Qty: {item.quantity}
                </p>
                
                {/* Gift Package Details */}
                {item.isGiftPackage && item.packageDetails && item.packageDetails.sizes && Array.isArray(item.packageDetails.sizes) && (
                  <div className="mt-1 text-xs text-gray-500">
                    <div className="flex items-center space-x-1 mb-1">
                      <Package className="h-3 w-3" />
                      <span>Package Contents:</span>
                    </div>
                    <div className="space-y-1 ml-4">
                      {item.packageDetails.sizes.map((sizeInfo: any, sizeIndex: number) => {
                        // Safety check for malformed data
                        if (!sizeInfo || typeof sizeInfo !== 'object') {
                          console.warn('Invalid sizeInfo in gift package:', sizeInfo);
                          return null;
                        }
                        
                        // Additional safety check for the selectedProduct field
                        if (!sizeInfo.selectedProduct || typeof sizeInfo.selectedProduct !== 'object') {
                          console.warn('Invalid selectedProduct in sizeInfo:', sizeInfo);
                          return (
                            <div key={sizeIndex} className="flex items-center space-x-1">
                              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                              <span>
                                {sizeInfo.size || 'Unknown size'}: No product selected
                              </span>
                            </div>
                          );
                        }
                        
                        return (
                          <div key={sizeIndex} className="flex items-center space-x-1">
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                            <span>
                              {sizeInfo.size || 'Unknown size'}: {sizeInfo.selectedProduct.productName || 'No product name'}
                            </span>
                          </div>
                        );
                      }).filter(Boolean)}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-sm font-medium text-right">
                {item.originalPrice && item.originalPrice > item.price ? (
                  <>
                    <div className="line-through text-gray-400 text-xs">
                      {formatPrice(item.originalPrice * item.quantity)}
                    </div>
                    <div className="text-red-600 font-bold">
                      {formatPrice(item.price * item.quantity)}
                    </div>
                  </>
                ) : (
                  <div>{formatPrice(item.price * item.quantity)}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator className="bg-gradient-to-r from-purple-200 to-pink-200" />

        {/* Discount Code */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-purple-800">Discount Code</Label>
          {!appliedDiscount ? (
            <div className="flex space-x-2">
              <Input
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value.toUpperCase())
                }}
                placeholder="Enter discount code"
                className="flex-1 text-sm border-gray-200 focus:border-purple-500 focus:ring-purple-500"
              />
              <Button
                type="button"
                onClick={onApplyDiscount}
                disabled={discountLoading || !discountCode.trim()}
                variant="outline"
                size="sm"
                className="whitespace-nowrap border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-500"
              >
                {discountLoading ? (
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-4 w-4 border-t-2 border-b-2 border-purple-500 rounded-full"
                  />
                ) : (
                  "Apply"
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Tag className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">{appliedDiscount.code}</span>
              </div>
              <Button
                type="button"
                onClick={onRemoveDiscount}
                variant="ghost"
                size="sm"
                className="text-green-600 hover:text-green-700 hover:bg-green-100"
              >
                Remove
              </Button>
            </div>
          )}
          
          {/* Discount Error Message */}
          {discountError && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="mt-2"
            >
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-600 text-sm">{discountError}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </div>

        <Separator className="bg-gradient-to-r from-purple-200 to-pink-200" />

        {/* Pricing */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {appliedDiscount && (
            <div className="flex justify-between text-green-600">
              <span>
                Discount (
                {appliedDiscount.type === "percentage"
                  ? `${appliedDiscount.value}%`
                  : appliedDiscount.type === "buyXgetX"
                  ? `BUY ${appliedDiscount.buyX} GET ${appliedDiscount.getX}`
                  : formatPrice(appliedDiscount.value)}
                )
              </span>
              <span>-{formatPrice(appliedDiscount.discountAmount)}</span>
            </div>
          )}
        </div>

        <Separator className="bg-gradient-to-r from-purple-200 to-pink-200" />

        <div className="flex justify-between text-lg font-medium">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          All prices include shipping.
        </p>

        {/* Form Error Message */}
        {formError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="mb-4"
          >
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-600 text-sm">{formError}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Button
          type="submit"
          className="w-full bg-black text-white hover:bg-gray-800 text-base py-3 rounded-full relative overflow-hidden group"
          size="lg"
          disabled={loading}
          onClick={() => onSubmit()}
        >
          <span className="relative z-10">
            {loading ? (
              <div className="flex items-center justify-center">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 border-t-2 border-b-2 border-white rounded-full mr-2"
                />
                Processing...
              </div>
            ) : (
              "Place Order"
            )}
          </span>
          <motion.span 
            className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100"
            initial={{ x: "-100%" }}
            whileHover={{ x: 0 }}
            transition={{ duration: 0.4 }}
          />
        </Button>

      </CardContent>
    </Card>
  )
}
