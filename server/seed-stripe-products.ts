import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Creating Stripe products for Equilibrium...');

  // Check if products already exist
  const existingProducts = await stripe.products.search({ 
    query: "name:'AI Pro' OR name:'Elite Mentoring'" 
  });
  
  if (existingProducts.data.length > 0) {
    console.log('Products already exist:');
    existingProducts.data.forEach(p => console.log(`  - ${p.name} (${p.id})`));
    return;
  }

  // Create AI Pro subscription product (£24.99/month)
  const aiProProduct = await stripe.products.create({
    name: 'AI Pro',
    description: 'AI-powered pattern detection, real-time alerts, advanced education, SMA crossover signals, and priority support.',
    metadata: {
      tier: 'pro',
      features: JSON.stringify([
        'AI-powered pattern detection',
        'Real-time pattern alerts',
        'Advanced educational content',
        'SMA crossover signals',
        'Trade setup recommendations',
        'Priority support'
      ])
    }
  });

  const aiProPrice = await stripe.prices.create({
    product: aiProProduct.id,
    unit_amount: 2499, // £24.99 in pence
    currency: 'gbp',
    recurring: { interval: 'month' },
    metadata: {
      tier: 'pro'
    }
  });

  console.log(`Created AI Pro product: ${aiProProduct.id}`);
  console.log(`Created AI Pro monthly price: ${aiProPrice.id} (£24.99/month)`);

  // Create Elite Mentoring subscription product (£500/month)
  const eliteProduct = await stripe.products.create({
    name: 'Elite Mentoring',
    description: 'Everything in AI Pro plus Liquidity Heatmap, order flow analysis, weekly 1-on-1 Zoom calls, private Discord access, and early feature access.',
    metadata: {
      tier: 'elite',
      features: JSON.stringify([
        'Everything in AI Pro',
        'Liquidity Heatmap (like Bookmap)',
        'Order flow analysis',
        'Weekly 1-on-1 Zoom coaching calls',
        'Private Discord access',
        'Early access to new features'
      ])
    }
  });

  const elitePrice = await stripe.prices.create({
    product: eliteProduct.id,
    unit_amount: 50000, // £500 in pence
    currency: 'gbp',
    recurring: { interval: 'month' },
    metadata: {
      tier: 'elite'
    }
  });

  console.log(`Created Elite Mentoring product: ${eliteProduct.id}`);
  console.log(`Created Elite Mentoring monthly price: ${elitePrice.id} (£500/month)`);

  console.log('\nProducts created successfully!');
  console.log('Webhooks will sync them to the database automatically.');
}

createProducts().catch(console.error);
