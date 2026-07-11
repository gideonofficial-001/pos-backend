import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryApi, salesApi, customersApi } from '@/api'
import { useAuthStore, useCartStore } from '@/store'
import { SaleType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { ShoppingCart, Minus, Plus, Trash2, Search, Package, Flame, Tag } from 'lucide-react'

const NewSale = () => {
  const { user } = useAuthStore()
  const { 
    items, addItem, removeItem, updateQuantity, clearCart, 
    getSubtotal, getTotal, customerName, customerPhone, 
    setCustomerInfo, discount, setDiscount 
  } = useCartStore()
  
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CASH)

  const [lpgModalOpen, setLpgModalOpen] = useState(false)
  const [selectedInvItem, setSelectedInvItem] = useState<any>(null)

  const branchId = user?.branchId || ''

  const { data: inventory } = useQuery({
    queryKey: ['inventory', branchId],
    queryFn: async () => {
      if (!branchId) return []
      const response = await inventoryApi.getAll({ branchId })
      return response.data
    },
    enabled: !!branchId,
  })

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await customersApi.getAll({ isInvoiceEligible: true })
      return response.data
    },
    enabled: saleType === SaleType.INVOICE,
  })

  const createSaleMutation = useMutation({
    mutationFn: (data: any) => salesApi.create(data),
    onSuccess: (response) => {
      toast.success(`Sale completed! Code: ${response.data.saleCode}`)
      clearCart()
      setSearch('') 
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create sale')
    },
  })

  const filteredInventory = search.trim() === '' 
    ? [] 
    : inventory?.filter((inv: any) => {
        if (!inv.product?.isActive) return false;
        return (
          inv.product.name.toLowerCase().includes(search.toLowerCase()) ||
          inv.product.code.toLowerCase().includes(search.toLowerCase())
        )
      })

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error('Cart is empty')
      return
    }

    const saleData = {
      branchId, 
      type: saleType, 
      customerName: customerName || undefined, 
      customerPhone: customerPhone || undefined, 
      discount,
      items: items.map(item => ({ 
        productId: item.productId.split('-')[0], 
        quantity: item.quantity 
      })),
    }

    createSaleMutation.mutate(saleData)
  }

  const handleLpgSelect = (type: 'REFILL' | 'EMPTY' | 'BOTH') => {
    if (!selectedInvItem) return;
    
    const p = selectedInvItem.product;

    if (type === 'REFILL') {
      if (selectedInvItem.fullCylinders > 0) {
        addItem({ ...p, id: p.id + '-refill', name: `${p.name} (Refill)` }, 1)
        toast.success(`Added ${p.name} Refill`)
      } else {
        toast.error('No full cylinders in stock!')
      }
    } else if (type === 'EMPTY') {
      if (selectedInvItem.emptyCylinders > 0) {
        addItem({ ...p, id: p.id + '-empty', name: `${p.name} (Empty Shell)`, price: 3500 }, 1)
        toast.success(`Added ${p.name} Empty Shell`)
      } else {
        toast.error('No empty shells in stock!')
      }
    } else if (type === 'BOTH') {
      if (selectedInvItem.fullCylinders > 0) {
        addItem({ ...p, id: p.id + '-complete', name: `${p.name} (Complete Set)`, price: Number(p.price) + 3500 }, 1)
        toast.success(`Added ${p.name} Complete Set`)
      } else {
         toast.error('No full cylinders in stock to make a complete set!')
      }
    }
    
    setLpgModalOpen(false)
    setSearch('')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Sale</h1>
        <p className="text-muted-foreground">Search to start a transaction</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Search & Products Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Start typing product name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-14 text-lg bg-white shadow-sm border-primary/20 focus-visible:ring-primary"
              autoFocus
            />
          </div>

          {search.trim() === '' ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed rounded-xl bg-muted/10">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Search className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Ready for next customer</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                Type a product name, code, or scan a barcode in the search bar above to begin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredInventory?.map((inv: any) => {
                const product = inv.product;
                const isLpg = product.type === 'LPG_REFILL' || product.type === 'LPG_CYLINDER';
                const availableStock = isLpg ? (inv.fullCylinders || 0) : inv.quantity;
                const isOutOfStock = availableStock === 0;

                return (
                  <Card
                    key={product.id}
                    className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                    onClick={() => {
                      if (isLpg) {
                        setSelectedInvItem(inv)
                        setLpgModalOpen(true)
                      } else {
                        if (!isOutOfStock) {
                          addItem(product, 1)
                          setSearch('')
                        } else {
                          toast.error('Out of stock!')
                        }
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">{isLpg ? 'LPG' : 'STANDARD'}</Badge>
                        <span className={`text-xs font-bold ${isOutOfStock ? 'text-destructive' : availableStock <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}>
                          {isOutOfStock ? 'Out of Stock' : `${availableStock} left`}
                        </span>
                      </div>
                      <h4 className="font-medium text-sm mb-1 line-clamp-2 min-h-[40px]">{product.name}</h4>
                      <p className="text-lg font-bold text-primary">{formatCurrency(product.price)}</p>
                    </CardContent>
                  </Card>
                )
              })}

              {filteredInventory?.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No products found matching &quot;{search}&quot;</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart Section */}
        <div className="space-y-4">
          <Card className="sticky top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Cart ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant={saleType === SaleType.CASH ? 'default' : 'outline'} className="flex-1" size="sm" onClick={() => setSaleType(SaleType.CASH)}>Cash</Button>
                <Button variant={saleType === SaleType.INVOICE ? 'default' : 'outline'} className="flex-1" size="sm" onClick={() => setSaleType(SaleType.INVOICE)}>Invoice</Button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {items.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Cart is empty</p>
                ) : (
                  items.map((item) => (
                    <div key={item.productId} className="flex items-center gap-2 p-2 bg-muted/50 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product.name}</p>
                        <p className="text-xs text-primary font-semibold">{formatCurrency(item.unitPrice)}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-background rounded-md border p-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateQuantity(item.productId, item.quantity - 1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 rounded-sm" 
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 ml-1" onClick={() => removeItem(item.productId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Input placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerInfo(e.target.value, customerPhone)} />
                <Input placeholder="Customer phone (optional)" value={customerPhone} onChange={e => setCustomerInfo(customerName, e.target.value)} />
              </div>

              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <Input type="number" placeholder="Discount (KES)" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} className="flex-1" />
              </div>

              <Separator />

              <div className="space-y-1 text-sm bg-muted/30 p-3 rounded-lg">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(getSubtotal())}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-destructive font-medium">
                    <span>Discount</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-black text-primary pt-2 mt-1 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(getTotal())}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full text-md h-12 shadow-sm" disabled={items.length === 0 || createSaleMutation.isPending} onClick={handleCheckout}>
                {createSaleMutation.isPending ? 'Processing...' : 'Complete Sale'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* The LPG Selection Modal */}
      <Dialog open={lpgModalOpen} onOpenChange={setLpgModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Sale Type: {selectedInvItem?.product?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            
            <Button 
              variant="outline" 
              className={`h-16 justify-start text-left px-4 ${selectedInvItem?.fullCylinders === 0 ? 'opacity-50' : 'hover:border-blue-400'}`} 
              onClick={() => handleLpgSelect('REFILL')}
            >
              <Flame className="w-5 h-5 mr-3 text-blue-500" />
              <div className="flex-1">
                <div className="flex justify-between w-full">
                  <p className="font-bold">Gas Refill Only</p>
                  <span className="text-xs font-medium text-blue-600">{selectedInvItem?.fullCylinders} left</span>
                </div>
                <p className="text-xs text-muted-foreground">Customer returns empty shell ({formatCurrency(selectedInvItem?.product?.price)})</p>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className={`h-16 justify-start text-left px-4 ${selectedInvItem?.emptyCylinders === 0 ? 'opacity-50' : 'hover:border-amber-400'}`} 
              onClick={() => handleLpgSelect('EMPTY')}
            >
              <Package className="w-5 h-5 mr-3 text-amber-600" />
              <div className="flex-1">
                <div className="flex justify-between w-full">
                  <p className="font-bold">Empty Cylinder</p>
                  <span className="text-xs font-medium text-amber-600">{selectedInvItem?.emptyCylinders} left</span>
                </div>
                <p className="text-xs text-muted-foreground">Selling shell asset (KES 3,500)</p>
              </div>
            </Button>
            
            <Button 
              className={`h-16 justify-start text-left px-4 ${selectedInvItem?.fullCylinders === 0 ? 'opacity-50' : ''}`}
              onClick={() => handleLpgSelect('BOTH')}
            >
              <Flame className="w-5 h-5 mr-3" />
              <div className="flex-1">
                <p className="font-bold">Complete Set (Gas + Shell)</p>
                <p className="text-xs opacity-90">Customer takes new cylinder (KES {Number(selectedInvItem?.product?.price) + 3500})</p>
              </div>
            </Button>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NewSale
