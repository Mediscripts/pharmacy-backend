import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()

function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase()
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `MS-${timestamp}-${randomPart}`
}

function normalizeCheckoutItem(item) {
  const productId = String(item?.productId || item?.id || '').trim()
  const quantity = Number.parseInt(item?.quantity, 10)

  if (!productId) {
    throw new Error('Each cart item must include a product id.')
  }

  if (Number.isNaN(quantity) || quantity <= 0) {
    throw new Error('Each cart item must include a valid quantity.')
  }

  return { productId, quantity }
}

router.post('/checkout', async (req, res, next) => {
  try {
    const customerName = String(req.body.customerName || '').trim()
    const customerEmail = String(req.body.customerEmail || '').trim()
    const customerPhone = String(req.body.customerPhone || '').trim()
    const deliveryAddress = String(req.body.deliveryAddress || '').trim()
    const rawItems = Array.isArray(req.body.items) ? req.body.items : []

    if (!customerName) {
      return res.status(400).json({ message: 'Full name is required.' })
    }

    if (!customerEmail) {
      return res.status(400).json({ message: 'Email is required.' })
    }

    if (!customerPhone) {
      return res.status(400).json({ message: 'Phone number is required.' })
    }

    if (!deliveryAddress) {
      return res.status(400).json({ message: 'Delivery address is required.' })
    }

    if (rawItems.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty.' })
    }

    const items = rawItems.map(normalizeCheckoutItem)
    const productIds = [...new Set(items.map((item) => item.productId))]

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, price, stock_quantity, prescription_required, is_active')
      .in('id', productIds)

    if (productsError) {
      throw productsError
    }

    const productMap = new Map((products || []).map((product) => [product.id, product]))

    if (productMap.size !== productIds.length) {
      return res.status(400).json({ message: 'One or more products in your cart no longer exist.' })
    }

    const lineItems = items.map((item) => {
      const product = productMap.get(item.productId)

      if (!product?.is_active) {
        throw new Error(`"${product?.name || 'A product'}" is no longer available.`)
      }

      if (product.prescription_required) {
        throw new Error(
          `"${product.name}" requires a prescription and cannot be checked out here yet.`,
        )
      }

      if (product.stock_quantity < item.quantity) {
        throw new Error(`"${product.name}" does not have enough stock for your order.`)
      }

      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: Number(product.price || 0),
      }
    })

    const totalAmount = lineItems.reduce(
      (sum, item) => sum + Number(item.unitPrice || 0) * item.quantity,
      0,
    )

    const orderNumber = generateOrderNumber()

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        status: 'Pending Payment',
        payment_status: 'Unpaid',
        requires_prescription: false,
        total_amount: totalAmount,
      })
      .select('id, order_number, total_amount, status, payment_status, created_at')
      .single()

    if (orderError) {
      throw orderError
    }

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(
      lineItems.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
    )

    if (itemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      throw itemsError
    }

    res.status(201).json({
      order: {
        ...order,
        items: lineItems.map((item) => {
          const product = productMap.get(item.productId)
          return {
            productId: item.productId,
            name: product?.name || 'Product',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }
        }),
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
