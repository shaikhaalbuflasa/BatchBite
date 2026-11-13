
const express = require("express");
const { readData, writeData } = require("./storage");
const crypto = require("crypto");

const app = express();

app.use(express.json());


function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");

    const hash = crypto.scryptSync(password, salt, 64).toString("hex");

    return salt + ":" + hash;
}

function checkPassword(password, storedPassword) {
    if (typeof storedPassword !== "string") {
        return false;
    }

    const parts = storedPassword.split(":");

    if (parts.length !== 2) {
        return false;
    }

    const salt = parts[0];
    const storedHash = Buffer.from(parts[1], "hex");

    if (storedHash.length !== 64) {
        return false;
    }

    const enteredHash = crypto.scryptSync(password, salt, 64);

    return crypto.timingSafeEqual(storedHash, enteredHash);
}


function getLoggedInUser(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.substring(7);
    const sessions = readData("sessions");
    const users = readData("users");

    const session = sessions.find(s =>
        s.token === token &&
        new Date(s.expiresAt).getTime() > Date.now()
    );

    if (!session) {
        return null;
    }

    const user = users.find(u =>
        u.id === session.userId &&
        u.isActive === true
    );

    return user || null;
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const user = getLoggedInUser(req);

        if (!user || !allowedRoles.includes(user.role)) {
            return res.status(403).json({
                error: "Access denied"
            });
        }

        req.loggedInUser = user;
        next();
    };
}


// An order belongs to the owner of its batch.
function ownerOwnsOrder(ownerId, order) {
    if (!order) return false;
    const batches = readData("batches");
    return batches.some(b => b.id === order.batchId && b.ownerId === ownerId);
}

function ownerOwnsTask(ownerId, task) {
    if (!task) return false;
    const orders = readData("orders");
    const order = orders.find(o => o.id === task.orderId);
    return ownerOwnsOrder(ownerId, order);
}


app.get("/", (req, res) => {
    res.send("BatchBite server is running!");
});


app.post("/login", (req, res) => {
    const users = readData("users");

    const email = req.body.email;
    const password = req.body.password;

    if (typeof email !== "string" ||
        typeof password !== "string") {
        return res.status(400).json({
            error: "Email and password are required"
        });
    }

    const user = users.find(u =>
        u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (!user ||
        !user.isActive ||
        !checkPassword(password, user.passwordHash)) {
        return res.status(401).json({
            error: "Invalid email or password"
        });
    }

    const sessions = readData("sessions");

    const token = crypto.randomBytes(32).toString("hex");

    const session = {
        token: token,
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000
        ).toISOString()
    };

    sessions.push(session);
    writeData("sessions", sessions);

    res.json({
        message: "Login successful",
        token: token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        }
    });
});


app.post("/logout", (req, res) => {
    const sessions = readData("sessions");

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Session token is required"
        });
    }

    const token = authHeader.substring(7);

    const session = sessions.find(s =>
        s.token === token
    );

    if (!session) {
        return res.status(401).json({
            error: "Invalid session token"
        });
    }

    const remainingSessions = sessions.filter(s =>
        s.token !== token
    );

    writeData("sessions", remainingSessions);

    res.json({
        message: "Logout successful"
    });
});


app.post("/register", (req, res) => {
    const users = readData("users");

    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;

    if (typeof name !== "string" ||
        name.trim() === "" ||
        typeof email !== "string" ||
        email.trim() === "" ||
        typeof password !== "string" ||
        password.length < 8) {
        return res.status(400).json({
            error: "Valid name, email, and password of at least 8 characters are required"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = users.find(user =>
        user.email.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
        return res.status(400).json({
            error: "Email is already registered"
        });
    }

    const newId = users.length > 0
        ? Math.max(...users.map(user => user.id)) + 1
        : 1;

    const newUser = {
        id: newId,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: "Customer",
        isActive: true
    };

    users.push(newUser);
    writeData("users", users);

    res.status(201).json({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive
    });
});


app.put("/admin/users/:id", (req, res) => {
    const admin = getLoggedInUser(req);

    if (!admin || admin.role !== "Administrator") {
        return res.status(403).json({
            error: "Only administrators can manage users"
        });
    }

    const users = readData("users");
    const userId = Number(req.params.id);

    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    const role = req.body.role;
    const isActive = req.body.isActive;

    const validRoles = [
        "Customer",
        "BusinessOwner",
        "KitchenStaff",
        "Administrator"
    ];

    if (role === undefined && isActive === undefined) {
        return res.status(400).json({
            error: "Role or account status is required"
        });
    }

    if (role !== undefined && !validRoles.includes(role)) {
        return res.status(400).json({
            error: "Invalid user role"
        });
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
        return res.status(400).json({
            error: "isActive must be true or false"
        });
    }

    if (user.id === admin.id &&
        (isActive === false ||
         (role !== undefined && role !== "Administrator"))) {
        return res.status(400).json({
            error: "Administrator cannot deactivate or remove their own administrator role"
        });
    }

    if (role !== undefined) {
        user.role = role;
    }

    if (isActive !== undefined) {
        user.isActive = isActive;
    }

    writeData("users", users);

    res.json({
        message: "User updated successfully",
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        }
    });
});


app.get("/users", requireRole("Administrator"), (req, res) => {
    const users = readData("users");

    const safeUsers = users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
    }));

    res.json(safeUsers);
});

app.get("/products", (req, res) => {
    const products = readData("products");

    res.json(products);
});


app.post("/products", requireRole("BusinessOwner"), (req, res) => {
    const products = readData("products");

    const newProduct = req.body;
    if (newProduct.ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only create products for your own business"
        });
    }

    if (!newProduct.name || !Array.isArray(newProduct.variants)) {
        return res.status(400).json({
            message: "Product name and variants are required"
        });
    }

    const newId = products.length === 0
        ? 1
        : Math.max(...products.map(product => product.id)) + 1;

    newProduct.id = newId;

    products.push(newProduct);

    writeData("products", products);

    res.status(201).json({
        message: "Product added successfully!",
        product: newProduct
    });
});


app.get("/orders", requireRole("Administrator"), (req, res) => {
    const orders = readData("orders");

    res.json(orders);
});


app.get("/production/preparation-groups", requireRole("KitchenStaff", "BusinessOwner"), (req, res) => {
    const allOrders = readData("orders");
    const orders = req.loggedInUser.role === "BusinessOwner"
        ? allOrders.filter(o => ownerOwnsOrder(req.loggedInUser.id, o))
        : allOrders;
    const groups = [];

    for (const order of orders) {
        if (order.status === "Cancelled" ||
            order.status === "Collected") {
            continue;
        }

        for (const item of order.items) {
            let group = groups.find(g =>
                g.batchId === order.batchId &&
                g.productId === item.productId &&
                g.variantId === item.variantId
            );

            if (!group) {
                group = {
                    batchId: order.batchId,
                    productId: item.productId,
                    variantId: item.variantId,
                    productName: item.productName,
                    variantName: item.variantName,
                    totalQuantity: 0,
                    orders: []
                };

                groups.push(group);
            }

            group.totalQuantity += item.quantity;

            group.orders.push({
                orderId: order.id,
                customerId: order.customerId,
                quantity: item.quantity,
                notes: item.notes || ""
            });
        }
    }

    res.json(groups);
});



app.get("/customers/:id/orders", requireRole("Customer"), (req, res) => {
    if (Number(req.params.id) !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only view your own orders"
        });
    }

    const orders = readData("orders");
    const users = readData("users");

    const customerId = Number(req.params.id);

    const customer = users.find(user =>
        user.id === customerId &&
        user.role === "Customer" &&
        user.isActive === true
    );

    if (!customer) {
        return res.status(404).json({
            error: "Customer not found"
        });
    }

    const customerOrders = orders.filter(order =>
        order.customerId === customerId
    );

    customerOrders.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(customerOrders);
});


app.get("/owners/:id/orders", requireRole("BusinessOwner"), (req, res) => {
    if (Number(req.params.id) !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only view your own business orders"
        });
    }
    const orders = readData("orders");
    const batches = readData("batches");
    const users = readData("users");
    const slots = readData("pickupSlots");

    const ownerId = Number(req.params.id);

    const owner = users.find(user =>
        user.id === ownerId &&
        user.role === "BusinessOwner" &&
        user.isActive === true
    );

    if (!owner) {
        return res.status(404).json({
            error: "Business owner not found"
        });
    }

    const ownerBatches = batches.filter(batch =>
        batch.ownerId === ownerId
    );

    const ownerOrders = orders.filter(order =>
        ownerBatches.some(batch =>
            batch.id === order.batchId
        )
    );

    const dashboardOrders = ownerOrders.map(order => {
        const customer = users.find(user =>
            user.id === order.customerId
        );

        const batch = batches.find(b =>
            b.id === order.batchId
        );

        const slot = slots.find(s =>
            s.id === order.pickupSlotId
        );

        return {
            ...order,
            customerName: customer ? customer.name : "Unknown",
            batchName: batch ? batch.name : "Unknown",
            pickupDate: slot ? slot.date : null,
            pickupStartTime: slot ? slot.startTime : null,
            pickupEndTime: slot ? slot.endTime : null
        };
    });

    dashboardOrders.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(dashboardOrders);
});


app.get("/kitchen/orders", requireRole("KitchenStaff", "BusinessOwner"), (req, res) => {
    const allOrders = readData("orders");
    const orders = req.loggedInUser.role === "BusinessOwner"
        ? allOrders.filter(o => ownerOwnsOrder(req.loggedInUser.id, o))
        : allOrders;
    const batches = readData("batches");
    const slots = readData("pickupSlots");

    const activeOrders = orders.filter(order =>
        order.status === "Confirmed" ||
        order.status === "Preparing" ||
        order.status === "Ready"
    );

    const kitchenOrders = activeOrders.map(order => {
        const batch = batches.find(b =>
            b.id === order.batchId
        );

        const slot = slots.find(s =>
            s.id === order.pickupSlotId
        );

        return {
            orderId: order.id,
            batchId: order.batchId,
            batchName: batch ? batch.name : "Unknown",
            status: order.status,
            items: order.items.map(item => ({
                productName: item.productName,
                variantName: item.variantName,
                quantity: item.quantity,
                notes: item.notes
            })),
            pickupDate: slot ? slot.date : null,
            pickupStartTime: slot ? slot.startTime : null,
            pickupEndTime: slot ? slot.endTime : null
        };
    });

    kitchenOrders.sort((a, b) =>
        a.orderId - b.orderId
    );

    res.json(kitchenOrders);
});



app.post("/orders", requireRole("Customer"), (req, res) => {

    if (req.body.customerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only place orders for your own account"
        });
    }

    const orders = readData("orders");
    const batches = readData("batches");
    const products = readData("products");
    const slots = readData("pickupSlots");
    const users = readData("users");
    const holds = readData("stockHolds");

    const ingredients = readData("ingredients");
    const recipes = readData("recipes");

    const newOrder = req.body;

    const customer = users.find(user =>
        user.id === newOrder.customerId &&
        user.role === "Customer" &&
        user.isActive === true
    );

    if (!customer) {
        return res.status(400).json({
            error: "Invalid customer"
        });
    }

    const batch = batches.find(b =>
        b.id === newOrder.batchId
    );

    if (!batch ||
        batch.status !== "Open" ||
        new Date() >= new Date(batch.orderDeadline)) {
        return res.status(400).json({
            error: "Batch is closed or unavailable"
        });
    }

    const slot = slots.find(s =>
        s.id === newOrder.pickupSlotId &&
        s.batchId === batch.id
    );

    if (!slot || slot.reservedOrders >= slot.maxOrders) {
        return res.status(400).json({
            error: "Pickup slot is unavailable"
        });
    }

    if (!Array.isArray(newOrder.items) ||
        newOrder.items.length === 0) {
        return res.status(400).json({
            error: "Order must contain items"
        });
    }

    const orderItems = [];
    let totalAmount = 0;
    const requested = {};

    for (const item of newOrder.items) {
        if (!Number.isInteger(item.productId) ||
            !Number.isInteger(item.variantId) ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0) {
            return res.status(400).json({
                error: "Invalid order item"
            });
        }

        const product = products.find(p =>
            p.id === item.productId &&
            p.ownerId === batch.ownerId &&
            p.isAvailable === true
        );

        const variant = product
            ? product.variants.find(v =>
                v.id === item.variantId
            )
            : null;

        const batchProduct = batch.products.find(p =>
            p.productId === item.productId &&
            p.variantId === item.variantId
        );

        if (!product || !variant || !batchProduct ||
            typeof variant.price !== "number" ||
            !Number.isFinite(variant.price) ||
            variant.price < 0) {
            return res.status(400).json({
                error: "Product or variant unavailable"
            });
        }

        const key = item.productId + "-" + item.variantId;
        requested[key] = (requested[key] || 0) + item.quantity;

        if (requested[key] >
            batchProduct.maxQuantity - batchProduct.orderedQuantity) {
            return res.status(400).json({
                error: "Not enough quantity available"
            });
        }

        const subtotal = Math.round(
            variant.price * item.quantity * 100
        ) / 100;

        orderItems.push({
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName: variant.name,
            quantity: item.quantity,
            unitPrice: variant.price,
            subtotal: subtotal,
            notes: typeof item.notes === "string"
                ? item.notes : ""
        });

        totalAmount += subtotal;
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    // Calculate ingredients needed for this order
const neededIngredients = {};

for (const item of orderItems) {
    const recipe = recipes.find(r =>
        r.productId === item.productId &&
        r.variantId === item.variantId &&
        r.ownerId === batch.ownerId &&
        r.isActive === true
    );

    if (!recipe || recipe.yieldQuantity <= 0) {
        return res.status(400).json({
            error: "Active recipe not found"
        });
    }

    for (const recipeItem of recipe.ingredients) {
        const quantityNeeded =
            (recipeItem.quantity / recipe.yieldQuantity) * item.quantity;

        const id = recipeItem.ingredientId;

        neededIngredients[id] =
            (neededIngredients[id] || 0) + quantityNeeded;
    }
}

// Check ingredient availability
for (const id in neededIngredients) {
    const ingredient = ingredients.find(i =>
        i.id === Number(id) &&
        i.ownerId === batch.ownerId
    );

    if (!ingredient) {
        return res.status(400).json({
            error: "Ingredient not found"
        });
    }

    let heldByOthers = 0;

    for (const hold of holds) {
        if (
            hold.ingredientId === Number(id) &&
            hold.customerId !== customer.id &&
            new Date(hold.expiresAt).getTime() > Date.now()
        ) {
            heldByOthers += hold.quantity;
        }
    }

    const available =
        ingredient.quantityAvailable -
        ingredient.quantityReserved -
        heldByOthers;

    if (neededIngredients[id] > available + 0.000001) {
        return res.status(400).json({
            error: "Not enough ingredients available"
        });
    }
}

    const newId = orders.length > 0
        ? Math.max(...orders.map(o => o.id)) + 1
        : 1;

    const now = new Date().toISOString();

    const order = {
        id: newId,
        customerId: customer.id,
        batchId: batch.id,
        items: orderItems,
        totalAmount: totalAmount,
        pickupSlotId: slot.id,
        paymentStatus: "Paid (Simulated)",
        status: "Confirmed",
        pickupCode: crypto.randomBytes(16).toString("hex"),
        pickupCodeUsed: false,
        createdAt: now,
        statusHistory: [
            { status: "Confirmed", timestamp: now }
        ],
        reservedIngredients: Object.keys(neededIngredients).map(id => ({
            ingredientId: Number(id),
            quantity: neededIngredients[id]
        }))
    };

    for (const item of orderItems) {
        const batchProduct = batch.products.find(p =>
            p.productId === item.productId &&
            p.variantId === item.variantId
        );

        batchProduct.orderedQuantity += item.quantity;
    }

    slot.reservedOrders += 1;

    if (slot.reservedOrders >= slot.maxOrders) {
        slot.isAvailable = false;
    }

    if (batch.products.every(p =>
        p.orderedQuantity >= p.maxQuantity)) {
        batch.status = "Closed";
    }


    // Reserve ingredients for the confirmed order
    for (const id in neededIngredients) {
        const ingredient = ingredients.find(i =>
            i.id === Number(id) &&
            i.ownerId === batch.ownerId
        );

        ingredient.quantityReserved += neededIngredients[id];
    }
    
    orders.push(order);

    // Remove the customer's active temporary holds
    const remainingHolds = holds.filter(h =>
    h.customerId !== customer.id
    );

    
writeData("orders", orders);
writeData("batches", batches);
writeData("pickupSlots", slots);
writeData("stockHolds", remainingHolds);
writeData("ingredients", ingredients);

// Create order confirmation notification
const notifications = readData("notifications");

const notificationId = notifications.length > 0
    ? Math.max(...notifications.map(n => n.id)) + 1
    : 1;

const notification = {
    id: notificationId,
    userId: customer.id,
    orderId: order.id,
    type: "OrderConfirmed",
    message: "Your order #" + order.id +
        " has been confirmed!",
    isRead: false,
    createdAt: now
};

notifications.push(notification);
writeData("notifications", notifications);

res.status(201).json(order);

});


app.put("/orders/:id/status", (req, res) => {
    const staff = getLoggedInUser(req);

    if (!staff ||
        (staff.role !== "KitchenStaff" &&
         staff.role !== "BusinessOwner")) {
        return res.status(403).json({
            error: "Only authorized staff can update order status"
        });
    }

    const orders = readData("orders");
    const ingredients = readData("ingredients");

    const orderId = Number(req.params.id);
    const newStatus = req.body.status;

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (staff.role === "BusinessOwner" && !ownerOwnsOrder(staff.id, order)) {
        return res.status(403).json({ error: "This order belongs to another business" });
    }

    if (newStatus === "Collected") {
        return res.status(400).json({
            error: "Orders must be collected through QR verification"
        });
    }

    const statuses = [
        "Confirmed",
        "Preparing",
        "Ready",
        "Collected"
    ];

    const currentIndex = statuses.indexOf(order.status);
    const newIndex = statuses.indexOf(newStatus);

    if (currentIndex === -1 ||
        newIndex !== currentIndex + 1) {
        return res.status(400).json({
            error: "Invalid order status transition"
        });
    }

    if (newStatus === "Preparing") {
        if (!Array.isArray(order.reservedIngredients)) {
            return res.status(400).json({
                error: "Order has no tracked ingredient reservations"
            });
        }

        for (const reserved of order.reservedIngredients) {
            const ingredient = ingredients.find(i =>
                i.id === reserved.ingredientId
            );

            if (!ingredient ||
                ingredient.quantityAvailable < reserved.quantity ||
                ingredient.quantityReserved + 0.000001 < reserved.quantity) {
                return res.status(400).json({
                    error: "Insufficient ingredient stock"
                });
            }
        }

        for (const reserved of order.reservedIngredients) {
            const ingredient = ingredients.find(i =>
                i.id === reserved.ingredientId
            );

            ingredient.quantityAvailable -= reserved.quantity;

            ingredient.quantityReserved = Math.max(
                0,
                ingredient.quantityReserved - reserved.quantity
            );

            if (ingredient.quantityReserved < 0.000001) {
                ingredient.quantityReserved = 0;
            }
        }

        order.ingredientsConsumed = true;
    }

    const now = new Date().toISOString();

    order.status = newStatus;

    order.statusHistory.push({
        status: newStatus,
        timestamp: now
    });

    if (newStatus === "Preparing") {
        writeData("ingredients", ingredients);
    }

    writeData("orders", orders);

    if (newStatus === "Ready") {
        const notifications = readData("notifications");

        const alreadyExists = notifications.some(n =>
            n.orderId === order.id &&
            n.type === "OrderReady"
        );

        if (!alreadyExists) {
            const newId = notifications.length > 0
                ? Math.max(...notifications.map(n => n.id)) + 1
                : 1;

            const notification = {
                id: newId,
                userId: order.customerId,
                orderId: order.id,
                type: "OrderReady",
                message: "Your order #" + order.id +
                    " is ready for pickup!",
                isRead: false,
                createdAt: now
            };

            notifications.push(notification);
            writeData("notifications", notifications);
        }
    }

    res.json(order);
});


app.put("/orders/:id/cancel", (req, res) => {
    const customer = getLoggedInUser(req);

    if (!customer || customer.role !== "Customer") {
        return res.status(403).json({
            error: "Only logged-in customers can cancel orders"
        });
    }

    const orders = readData("orders");
    const batches = readData("batches");
    const pickupSlots = readData("pickupSlots");
    const ingredients = readData("ingredients");

    const orderId = Number(req.params.id);
    const customerId = customer.id;

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (order.customerId !== customerId) {
        return res.status(403).json({
            error: "This order does not belong to this customer"
        });
    }

    if (order.status !== "Confirmed") {
        return res.status(400).json({
            error: "Order cannot be cancelled at this stage"
        });
    }

    const batch = batches.find(b => b.id === order.batchId);
    const slot = pickupSlots.find(s =>
        s.id === order.pickupSlotId &&
        s.batchId === order.batchId
    );

    if (!batch || !slot) {
        return res.status(400).json({
            error: "Batch or pickup slot not found"
        });
    }

    for (const item of order.items) {
        const batchProduct = batch.products.find(p =>
            p.productId === item.productId &&
            p.variantId === item.variantId
        );

        if (!batchProduct ||
            batchProduct.orderedQuantity < item.quantity) {
            return res.status(400).json({
                error: "Invalid batch quantity"
            });
        }
    }

    if (slot.reservedOrders < 1) {
        return res.status(400).json({
            error: "Invalid pickup reservation"
        });
    }

    // Check reserved ingredients before cancelling
if (Array.isArray(order.reservedIngredients)) {
    for (const reserved of order.reservedIngredients) {
        const ingredient = ingredients.find(i =>
            i.id === reserved.ingredientId &&
            i.ownerId === batch.ownerId
        );

        if (!ingredient ||
            ingredient.quantityReserved + 0.000001 < reserved.quantity) {
            return res.status(400).json({
                error: "Invalid ingredient reservation"
            });
        }
    }

    // Release ingredients
    for (const reserved of order.reservedIngredients) {
        const ingredient = ingredients.find(i =>
            i.id === reserved.ingredientId &&
            i.ownerId === batch.ownerId
        );

        ingredient.quantityReserved = Math.max(
            0,
            ingredient.quantityReserved - reserved.quantity
        );
    }
}



    for (const item of order.items) {
        const batchProduct = batch.products.find(p =>
            p.productId === item.productId &&
            p.variantId === item.variantId
        );

        batchProduct.orderedQuantity -= item.quantity;
    }

    slot.reservedOrders -= 1;
    slot.isAvailable = slot.reservedOrders < slot.maxOrders;

    const now = new Date().toISOString();

    order.status = "Cancelled";

    order.statusHistory.push({
        status: "Cancelled",
        timestamp: now
    });

    writeData("orders", orders);
    writeData("batches", batches);
    writeData("pickupSlots", pickupSlots);
    writeData("ingredients", ingredients);


    const notifications = readData("notifications");

const newId = notifications.length > 0
    ? Math.max(...notifications.map(n => n.id)) + 1
    : 1;

const notification = {
    id: newId,
    userId: order.customerId,
    orderId: order.id,
    type: "OrderCancelled",
    message: "Your order #" + order.id + " has been cancelled.",
    isRead: false,
    createdAt: now
};

notifications.push(notification);
writeData("notifications", notifications);

    res.json({
        message: "Order cancelled successfully",
        order: order
    });
});


app.put("/orders/:id/modify", (req, res) => {
    const customer = getLoggedInUser(req);

    if (!customer || customer.role !== "Customer") {
        return res.status(403).json({
            error: "Only logged-in customers can modify orders"
        });
    }

    const orders = readData("orders");
    const batches = readData("batches");
    const slots = readData("pickupSlots");
    const ingredients = readData("ingredients");
    const holds = readData("stockHolds");

    const orderId = Number(req.params.id);
    const customerId = customer.id;
    const newQuantity = req.body.quantity;

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (order.customerId !== customerId) {
        return res.status(403).json({
            error: "This order does not belong to this customer"
        });
    }

    if (order.status !== "Confirmed") {
        return res.status(400).json({
            error: "Order cannot be modified at this stage"
        });
    }

    if (!Number.isInteger(newQuantity) || newQuantity <= 0) {
        return res.status(400).json({
            error: "Invalid quantity"
        });
    }

    if (order.items.length !== 1) {
        return res.status(400).json({
            error: "Only single-item orders can be modified"
        });
    }

    const batch = batches.find(b => b.id === order.batchId);

    if (!batch || batch.status !== "Open" ||
        new Date() >= new Date(batch.orderDeadline)) {
        return res.status(400).json({
            error: "Batch is closed or unavailable"
        });
    }

    const item = order.items[0];

    const batchProduct = batch.products.find(p =>
        p.productId === item.productId &&
        p.variantId === item.variantId
    );

    if (!batchProduct) {
        return res.status(400).json({
            error: "Batch product not found"
        });
    }

    const difference = newQuantity - item.quantity;

    if (batchProduct.orderedQuantity + difference >
        batchProduct.maxQuantity ||
        batchProduct.orderedQuantity + difference < 0) {
        return res.status(400).json({
            error: "Not enough quantity available"
        });
    }

        // Older orders may not have ingredient reservations
        if (!Array.isArray(order.reservedIngredients)) {
            return res.status(400).json({
                error: "This order has no tracked ingredient reservations"
            });
        }
    
        const oldQuantity = item.quantity;
        const updatedReservations = [];
    
        for (const reserved of order.reservedIngredients) {
            const ingredient = ingredients.find(i =>
                i.id === reserved.ingredientId &&
                i.ownerId === batch.ownerId
            );
    
            if (!ingredient) {
                return res.status(400).json({
                    error: "Ingredient not found"
                });
            }
    
            const newReservedQuantity =
                reserved.quantity * newQuantity / oldQuantity;
    
            const change = newReservedQuantity - reserved.quantity;
    
            let heldByOthers = 0;
    
            for (const hold of holds) {
                if (
                    hold.ingredientId === ingredient.id &&
                    hold.customerId !== order.customerId &&
                    new Date(hold.expiresAt).getTime() > Date.now()
                ) {
                    heldByOthers += hold.quantity;
                }
            }
    
            const available =
                ingredient.quantityAvailable -
                ingredient.quantityReserved -
                heldByOthers;
    
            if (change > available + 0.000001) {
                return res.status(400).json({
                    error: "Not enough ingredients available"
                });
            }
    
            if (ingredient.quantityReserved + change < -0.000001) {
                return res.status(400).json({
                    error: "Invalid ingredient reservation"
                });
            }
    
            updatedReservations.push({
                ingredient: ingredient,
                reserved: reserved,
                newQuantity: newReservedQuantity,
                change: change
            });
        }
    
        // Apply changes only after all checks pass
        for (const update of updatedReservations) {
            update.ingredient.quantityReserved += update.change;
            update.reserved.quantity = update.newQuantity;
        }

    batchProduct.orderedQuantity += difference;

    item.quantity = newQuantity;
    item.subtotal = Math.round(item.unitPrice * newQuantity * 100) / 100;
    order.totalAmount = item.subtotal;

    if (!Array.isArray(order.modificationHistory)) {
        order.modificationHistory = [];
    }

    order.modificationHistory.push({
        quantity: newQuantity,
        timestamp: new Date().toISOString()
    });

    writeData("orders", orders);
    writeData("batches", batches);
    writeData("ingredients", ingredients);


    res.json({
        message: "Order modified successfully",
        order: order
    });
});


app.get("/batches", (req, res) => {
    const batches = readData("batches");
    const now = new Date();
    let changed = false;

    for (const batch of batches) {
        if (batch.status === "Open") {
            const deadlinePassed =
                now >= new Date(batch.orderDeadline);

            const capacityReached =
                batch.products.every(item =>
                    item.orderedQuantity >= item.maxQuantity
                );

            if (deadlinePassed || capacityReached) {
                batch.status = "Closed";
                changed = true;
            }
        }
    }

    if (changed) {
        writeData("batches", batches);
    }

    res.json(batches);
});




app.get("/pickupSlots", (req, res) => {
    const slots = readData("pickupSlots");
    let changed = false;

    for (const slot of slots) {
        const available = slot.reservedOrders < slot.maxOrders;

        if (slot.isAvailable !== available) {
            slot.isAvailable = available;
            changed = true;
        }
    }

    if (changed) {
        writeData("pickupSlots", slots);
    }

    res.json(slots);
});


app.post("/pickupSlots", (req, res) => {
    const owner = getLoggedInUser(req);

    if (!owner || owner.role !== "BusinessOwner") {
        return res.status(403).json({
            error: "Only logged-in business owners can create pickup slots"
        });
    }

    const slots = readData("pickupSlots");
    const batches = readData("batches");

    const newSlot = req.body;

    if (newSlot.ownerId !== owner.id) {
        return res.status(403).json({
            error: "You can only create pickup slots for your own batches"
        });
    }

    if (!Number.isInteger(newSlot.ownerId) ||
        !Number.isInteger(newSlot.batchId) ||
        !newSlot.date ||
        !newSlot.startTime ||
        !newSlot.endTime ||
        !Number.isInteger(newSlot.maxOrders) ||
        newSlot.maxOrders <= 0) {

        return res.status(400).json({
            error: "Invalid pickup slot information"
        });
    }

    const batch = batches.find(b =>
        b.id === newSlot.batchId &&
        b.ownerId === newSlot.ownerId
    );

    if (!batch) {
        return res.status(404).json({
            error: "Batch not found for this owner"
        });
    }

    if (newSlot.date !== batch.pickupDate ||
        newSlot.startTime >= newSlot.endTime) {

        return res.status(400).json({
            error: "Invalid pickup date or time"
        });
    }

    const duplicate = slots.some(slot =>
        slot.batchId === newSlot.batchId &&
        slot.date === newSlot.date &&
        slot.startTime === newSlot.startTime &&
        slot.endTime === newSlot.endTime
    );

    if (duplicate) {
        return res.status(400).json({
            error: "This pickup slot already exists"
        });
    }

    const newId = slots.length > 0
        ? Math.max(...slots.map(slot => slot.id)) + 1
        : 1;

    const slot = {
        id: newId,
        ownerId: newSlot.ownerId,
        batchId: newSlot.batchId,
        date: newSlot.date,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
        maxOrders: newSlot.maxOrders,
        reservedOrders: 0,
        isAvailable: true
    };

    slots.push(slot);
    writeData("pickupSlots", slots);

    res.status(201).json(slot);
});


app.get("/productionTasks", requireRole("KitchenStaff", "BusinessOwner"), (req, res) => {
    const tasks = readData("productionTasks");
    if (req.loggedInUser.role === "BusinessOwner") {
        return res.json(tasks.filter(t => ownerOwnsTask(req.loggedInUser.id, t)));
    }
    res.json(tasks);
});


app.post("/productionTasks", (req, res) => {
    const loggedInStaff = getLoggedInUser(req);

    if (!loggedInStaff ||
        (loggedInStaff.role !== "KitchenStaff" &&
         loggedInStaff.role !== "BusinessOwner")) {
        return res.status(403).json({
            error: "Only authorized staff can create production tasks"
        });
    }

    const tasks = readData("productionTasks");
    const orders = readData("orders");
    const users = readData("users");

    const newTask = req.body;

    if (!Number.isInteger(newTask.orderId) ||
        typeof newTask.name !== "string" ||
        newTask.name.trim() === "" ||
        !["Low", "Medium", "High"].includes(newTask.priority) ||
        !Number.isInteger(newTask.assignedTo)) {

        return res.status(400).json({
            error: "Invalid task information"
        });
    }

    const order = orders.find(o =>
        o.id === newTask.orderId &&
        ["Confirmed", "Preparing"].includes(o.status)
    );

    if (!order) {
        return res.status(400).json({
            error: "Order not found or not available for production"
        });
    }

    if (loggedInStaff.role === "BusinessOwner") {
        const batches = readData("batches");
        const batch = batches.find(b => b.id === order.batchId);
    
        if (!batch || batch.ownerId !== loggedInStaff.id) {
            return res.status(403).json({
                error: "You can only manage production tasks for your own business"
            });
        }
    }

    const staff = users.find(u =>
        u.id === newTask.assignedTo &&
        u.role === "KitchenStaff" &&
        u.isActive === true
    );

    if (!staff) {
        return res.status(400).json({
            error: "Invalid kitchen staff member"
        });
    }

    const newId = tasks.length > 0
        ? Math.max(...tasks.map(t => t.id)) + 1
        : 1;

    const task = {
        id: newId,
        orderId: order.id,
        batchId: order.batchId,
        name: newTask.name.trim(),
        assignedTo: staff.id,
        priority: newTask.priority,
        status: "Pending",
        createdAt: new Date().toISOString(),
        completedAt: null
    };

    tasks.push(task);
    writeData("productionTasks", tasks);

    res.status(201).json(task);
});




app.put("/productionTasks/:id/complete", (req, res) => {
    const loggedInStaff = getLoggedInUser(req);

    if (!loggedInStaff ||
        (loggedInStaff.role !== "KitchenStaff" &&
         loggedInStaff.role !== "BusinessOwner")) {
        return res.status(403).json({
            error: "Only authorized staff can complete production tasks"
        });
    }

    const tasks = readData("productionTasks");
    const taskId = Number(req.params.id);

    const task = tasks.find(t => t.id === taskId);


    if (!task) {
        return res.status(404).json({
            error: "Task not found"
        });
    }

    if (loggedInStaff.role === "BusinessOwner") {
        const orders = readData("orders");
        const batches = readData("batches");
    
        const order = orders.find(o => o.id === task.orderId);
        const batch = order
            ? batches.find(b => b.id === order.batchId)
            : null;
    
        if (!batch || batch.ownerId !== loggedInStaff.id) {
            return res.status(403).json({
                error: "You can only manage production tasks for your own business"
            });
        }
    }

    if (task.status === "Completed") {
        return res.status(400).json({
            error: "Task is already completed"
        });
    }

    if (task.status !== "Pending") {
        return res.status(400).json({
            error: "Task cannot be completed"
        });
    }



    task.status = "Completed";
    task.completedAt = new Date().toISOString();

    writeData("productionTasks", tasks);

    res.json(task);
});



app.delete("/productionTasks/:id", (req, res) => {
    const loggedInStaff = getLoggedInUser(req);

    if (!loggedInStaff ||
        (loggedInStaff.role !== "KitchenStaff" &&
         loggedInStaff.role !== "BusinessOwner")) {
        return res.status(403).json({
            error: "Only authorized staff can delete production tasks"
        });
    }

    const tasks = readData("productionTasks");
    const taskId = Number(req.params.id);

    const task = tasks.find(t => t.id === taskId);

    if (!task) {
        return res.status(404).json({
            error: "Task not found"
        });
    }

    if (loggedInStaff.role === "BusinessOwner") {
        const orders = readData("orders");
        const batches = readData("batches");
    
        const order = orders.find(o => o.id === task.orderId);
        const batch = order
            ? batches.find(b => b.id === order.batchId)
            : null;
    
        if (!batch || batch.ownerId !== loggedInStaff.id) {
            return res.status(403).json({
                error: "You can only manage production tasks for your own business"
            });
        }
    }

    if (task.status === "Completed") {
        return res.status(400).json({
            error: "Completed tasks cannot be deleted"
        });
    }

    const updatedTasks = tasks.filter(t =>
        t.id !== taskId
    );

    writeData("productionTasks", updatedTasks);

    res.json({
        message: "Task deleted successfully"
    });
});


app.put("/productionTasks/:id/priority", (req, res) => {
    const loggedInStaff = getLoggedInUser(req);

    if (!loggedInStaff ||
        (loggedInStaff.role !== "KitchenStaff" &&
         loggedInStaff.role !== "BusinessOwner")) {
        return res.status(403).json({
            error: "Only authorized staff can change task priorities"
        });
    }

    const tasks = readData("productionTasks");
    const taskId = Number(req.params.id);
    const newPriority = req.body.priority;

    const task = tasks.find(t => t.id === taskId);

    if (!task) {
        return res.status(404).json({
            error: "Task not found"
        });
    }

    if (loggedInStaff.role === "BusinessOwner") {
        const orders = readData("orders");
        const batches = readData("batches");
    
        const order = orders.find(o => o.id === task.orderId);
        const batch = order
            ? batches.find(b => b.id === order.batchId)
            : null;
    
        if (!batch || batch.ownerId !== loggedInStaff.id) {
            return res.status(403).json({
                error: "You can only manage production tasks for your own business"
            });
        }
    }

    if (!["Low", "Medium", "High"].includes(newPriority)) {
        return res.status(400).json({
            error: "Invalid priority"
        });
    }

    if (task.status !== "Pending") {
        return res.status(400).json({
            error: "Only pending tasks can change priority"
        });
    }

    task.priority = newPriority;

    writeData("productionTasks", tasks);

    res.json(task);
});




app.get("/ingredients", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const ingredients = readData("ingredients");
    if (req.loggedInUser.role === "BusinessOwner") {
        return res.json(ingredients.filter(i => i.ownerId === req.loggedInUser.id));
    }
    res.json(ingredients);
});

app.put("/ingredients/:id/stock", requireRole("BusinessOwner"), (req, res) => {
    const ingredients = readData("ingredients");
    const ingredientId = Number(req.params.id);
    const { ownerId, quantityAvailable } = req.body;

    if (req.loggedInUser.role === "BusinessOwner" &&
        ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only manage ingredients for your own business"
        });
    }

    const ingredient = ingredients.find(i =>
        i.id === ingredientId &&
        i.ownerId === ownerId
    );

    if (!ingredient) {
        return res.status(404).json({
            error: "Ingredient not found for this owner"
        });
    }

    if (
        !Number.isFinite(quantityAvailable) ||
        quantityAvailable < 0 ||
        quantityAvailable < ingredient.quantityReserved
    ) {
        return res.status(400).json({
            error: "Invalid stock quantity"
        });
    }

    ingredient.quantityAvailable = quantityAvailable;

    writeData("ingredients", ingredients);

    res.json({
        message: "Ingredient stock updated successfully",
        ingredient: ingredient
    });
});

app.put("/ingredients/:id/reserve", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const ingredients = readData("ingredients");
    const ingredientId = Number(req.params.id);
    const { ownerId, quantity } = req.body;

    if (req.loggedInUser.role === "BusinessOwner" &&
        ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only manage ingredients for your own business"
        });
    }


    const ingredient = ingredients.find(i =>
        i.id === ingredientId &&
        i.ownerId === ownerId
    );

    if (!ingredient) {
        return res.status(404).json({
            error: "Ingredient not found for this owner"
        });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
            error: "Invalid reservation quantity"
        });
    }

    const availableStock =
        ingredient.quantityAvailable - ingredient.quantityReserved;

    if (quantity > availableStock) {
        return res.status(400).json({
            error: "Not enough available stock"
        });
    }

    ingredient.quantityReserved += quantity;

    writeData("ingredients", ingredients);

    res.json({
        message: "Ingredient reserved successfully",
        ingredient: ingredient
    });
});

app.put("/ingredients/:id/release", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const ingredients = readData("ingredients");
    const ingredientId = Number(req.params.id);
    const { ownerId, quantity } = req.body;
    if (req.loggedInUser.role === "BusinessOwner" &&
    ownerId !== req.loggedInUser.id) {
    return res.status(403).json({
        error: "You can only manage ingredients for your own business"
    });
    }

    const ingredient = ingredients.find(i =>
        i.id === ingredientId &&
        i.ownerId === ownerId
    );

    if (!ingredient) {
        return res.status(404).json({
            error: "Ingredient not found for this owner"
        });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
            error: "Invalid release quantity"
        });
    }

    if (quantity > ingredient.quantityReserved) {
        return res.status(400).json({
            error: "Cannot release more than reserved quantity"
        });
    }

    ingredient.quantityReserved -= quantity;

    writeData("ingredients", ingredients);

    res.json({
        message: "Ingredient reservation released successfully",
        ingredient: ingredient
    });
});


app.put("/ingredients/:id/consume", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const ingredients = readData("ingredients");
    const ingredientId = Number(req.params.id);
    const { ownerId, quantity } = req.body;

    if (req.loggedInUser.role === "BusinessOwner" &&
        ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only manage ingredients for your own business"
        });
    }

    const ingredient = ingredients.find(i =>
        i.id === ingredientId &&
        i.ownerId === ownerId
    );

    if (!ingredient) {
        return res.status(404).json({
            error: "Ingredient not found for this owner"
        });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
            error: "Invalid consumption quantity"
        });
    }

    if (quantity > ingredient.quantityReserved ||
        quantity > ingredient.quantityAvailable) {
        return res.status(400).json({
            error: "Not enough reserved or available stock"
        });
    }

    ingredient.quantityAvailable -= quantity;
    ingredient.quantityReserved -= quantity;

    writeData("ingredients", ingredients);

    res.json({
        message: "Ingredient consumed successfully",
        ingredient: ingredient
    });
});


app.post("/ingredients", requireRole("BusinessOwner"), (req, res) => {
    const ingredients = readData("ingredients");

    const { ownerId, name, unit, quantityAvailable } = req.body;
    if (ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only add ingredients to your own business"
        });
    }

    if (
        !Number.isInteger(ownerId) ||
        ownerId <= 0 ||
        typeof name !== "string" ||
        name.trim() === "" ||
        typeof unit !== "string" ||
        unit.trim() === "" ||
        !Number.isFinite(quantityAvailable) ||
        quantityAvailable < 0
    ) {
        return res.status(400).json({
            error: "Invalid ingredient information"
        });
    }

    const users = readData("users");

    const owner = users.find(u =>
        u.id === ownerId &&
        u.role === "BusinessOwner" &&
        u.isActive === true
    );

    if (!owner) {
        return res.status(404).json({
            error: "Business owner not found"
        });
    }

    const existingIngredient = ingredients.find(i =>
        i.ownerId === ownerId &&
        i.name.toLowerCase() === name.trim().toLowerCase()
    );

    if (existingIngredient) {
        return res.status(400).json({
            error: "Ingredient already exists"
        });
    }

    const newId = ingredients.length > 0
        ? Math.max(...ingredients.map(i => i.id)) + 1
        : 1;

    const newIngredient = {
        id: newId,
        ownerId: ownerId,
        name: name.trim(),
        unit: unit.trim(),
        quantityAvailable: quantityAvailable,
        quantityReserved: 0
    };

    ingredients.push(newIngredient);
    writeData("ingredients", ingredients);

    res.status(201).json({
        message: "Ingredient added successfully",
        ingredient: newIngredient
    });
});



app.get("/recipes", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const recipes = readData("recipes");
    if (req.loggedInUser.role === "BusinessOwner") {
        return res.json(recipes.filter(r => r.ownerId === req.loggedInUser.id));
    }
    res.json(recipes);
});


app.get("/recipes/:id/calculate", requireRole("BusinessOwner", "KitchenStaff"), (req, res) => {
    const recipes = readData("recipes");
    const ingredients = readData("ingredients");

    const recipeId = Number(req.params.id);
    const quantity = Number(req.query.quantity);

    const recipe = recipes.find(r =>
        r.id === recipeId &&
        r.isActive === true
    );

    if (!recipe) {
        return res.status(404).json({
            error: "Recipe not found"
        });
    }

    if (req.loggedInUser.role === "BusinessOwner" &&
        recipe.ownerId !== req.loggedInUser.id) {
        return res.status(403).json({ error: "You can only view your own recipes" });
    }

    if (!Number.isInteger(quantity) ||
        quantity <= 0 ||
        !Number.isInteger(recipe.yieldQuantity) ||
        recipe.yieldQuantity <= 0) {
        return res.status(400).json({
            error: "Invalid quantity"
        });
    }

    const multiplier = quantity / recipe.yieldQuantity;


    const requirements = recipe.ingredients.map(item => {
        const ingredient = ingredients.find(i =>
            i.id === item.ingredientId &&
            i.ownerId === recipe.ownerId
        );

        const required = Math.round(
            item.quantity * multiplier * 100
        ) / 100;

        const available = ingredient
            ? Math.max(0,
                ingredient.quantityAvailable -
                ingredient.quantityReserved)
            : 0;

        const shortage = Math.max(0, required - available);

        return {
            ingredientId: item.ingredientId,
            ingredientName: ingredient
                ? ingredient.name : "Unknown",
            requiredQuantity: required,
            availableQuantity: available,
            shortageQuantity: Math.round(shortage * 100) / 100,
            unit: ingredient ? ingredient.unit : item.unit
        };
    });

    
    const purchasingList = requirements.filter(item =>
        item.shortageQuantity > 0
    );

    res.json({
        recipeId: recipe.id,
        recipeName: recipe.name,
        requestedQuantity: quantity,
        recipeYield: recipe.yieldQuantity,
        ingredients: requirements,
        purchasingList: purchasingList
    });

});


app.post("/orders/:id/delay", requireRole("KitchenStaff", "BusinessOwner"), (req, res) => {
    const orders = readData("orders");
    const notifications = readData("notifications");
    const users = readData("users");

    const orderId = Number(req.params.id);
    const staffId = req.loggedInUser.id;
    const reason = req.body.reason;

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (req.loggedInUser.role === "BusinessOwner" &&
        !ownerOwnsOrder(req.loggedInUser.id, order)) {
        return res.status(403).json({ error: "This order belongs to another business" });
    }

    const staff = users.find(u =>
        u.id === staffId &&
        u.isActive === true &&
        (u.role === "KitchenStaff" ||
         u.role === "BusinessOwner")
    );

    if (!staff) {
        return res.status(403).json({
            error: "Only authorized staff can send delay notifications"
        });
    }

    if (order.status !== "Confirmed" &&
        order.status !== "Preparing") {
        return res.status(400).json({
            error: "Only active orders can be delayed"
        });
    }

    if (typeof reason !== "string" ||
        reason.trim() === "") {
        return res.status(400).json({
            error: "Delay reason is required"
        });
    }

    const newId = notifications.length > 0
        ? Math.max(...notifications.map(n => n.id)) + 1
        : 1;

    const notification = {
        id: newId,
        userId: order.customerId,
        orderId: order.id,
        type: "OrderDelayed",
        message: "Your order #" + order.id +
            " is delayed. Reason: " + reason.trim(),
        isRead: false,
        createdAt: new Date().toISOString()
    };

    notifications.push(notification);
    writeData("notifications", notifications);

    res.status(201).json(notification);
});


app.get("/notifications", requireRole("Customer", "BusinessOwner", "KitchenStaff", "Administrator"), (req, res) => {
    const notifications = readData("notifications");

    const myNotifications = notifications.filter(n =>
        n.userId === req.loggedInUser.id
    );

    res.json(myNotifications);
});

app.put("/notifications/:id/read", requireRole("Customer", "BusinessOwner", "KitchenStaff", "Administrator"), (req, res) => {
    const notifications = readData("notifications");
    const notificationId = Number(req.params.id);

    const notification = notifications.find(n =>
        n.id === notificationId
    );

    if (!notification) {
        return res.status(404).json({
            error: "Notification not found"
        });
    }

    if (notification.userId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only update your own notifications"
        });
    }

    notification.isRead = true;

    writeData("notifications", notifications);

    res.json(notification);
});



app.put("/products/:id", requireRole("BusinessOwner"), (req, res) => {
    const products = readData("products");

    const productId = Number(req.params.id);

    const product = products.find(p => p.id === productId);

    if (!product) {
        return res.status(404).json({
            message: "Product not found"
        });
    }

    if (product.ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only edit your own products"
        });
    }

    const updatedData = req.body;

    if (typeof updatedData.name !== "string" ||
        updatedData.name.trim() === "" ||
        !Array.isArray(updatedData.variants)) {
        return res.status(400).json({
            message: "Valid product name and variants are required"
        });
    }

    product.name = updatedData.name;
    product.description = updatedData.description || "";
    product.image = updatedData.image || "";
    product.variants = updatedData.variants;
    product.isAvailable = updatedData.isAvailable === true;

    writeData("products", products);

    res.json({
        message: "Product updated successfully!",
        product: product
    });
});


app.delete("/products/:id", requireRole("BusinessOwner"), (req, res) => {
    const products = readData("products");

    const productId = Number(req.params.id);

    const product = products.find(p => p.id === productId);

    if (!product) {
        return res.status(404).json({
            message: "Product not found"
        });
    }

    if (product.ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only delete your own products"
        });
    }

    product.isAvailable = false;

    writeData("products", products);

    res.json({
        message: "Product removed from availability!",
        product: product
    });
});



app.post("/batches", requireRole("BusinessOwner"), (req, res) => {
    const batches = readData("batches");
    const products = readData("products");

    const newBatch = req.body;

    if (newBatch.ownerId !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only create batches for your own business"
        });
    }

    if (!Number.isInteger(newBatch.ownerId) ||
        typeof newBatch.name !== "string" ||
        newBatch.name.trim() === "" ||
        !Array.isArray(newBatch.products) ||
        newBatch.products.length === 0 ||
        !newBatch.orderDeadline ||
        !newBatch.pickupDate) {
        return res.status(400).json({
            message: "Invalid or missing batch information"
        });
    }

    if (isNaN(Date.parse(newBatch.orderDeadline)) ||
        isNaN(Date.parse(newBatch.pickupDate)) ||
        Date.parse(newBatch.orderDeadline) >= Date.parse(newBatch.pickupDate)) {
        return res.status(400).json({
            message: "Invalid batch dates"
        });
    }

    for (const item of newBatch.products) {
        const product = products.find(p =>
            p.id === item.productId &&
            p.ownerId === newBatch.ownerId &&
            p.isAvailable === true
        );

        if (!product ||
            !product.variants.some(v => v.id === item.variantId) ||
            !Number.isInteger(item.maxQuantity) ||
            item.maxQuantity <= 0) {
            return res.status(400).json({
                message: "Invalid product, variant, or quantity"
            });
        }
    }

    const newId = batches.length === 0
        ? 1
        : Math.max(...batches.map(b => b.id)) + 1;

    const batch = {
        id: newId,
        ownerId: newBatch.ownerId,
        name: newBatch.name,
        products: newBatch.products.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            maxQuantity: item.maxQuantity,
            orderedQuantity: 0
        })),
        orderDeadline: newBatch.orderDeadline,
        pickupDate: newBatch.pickupDate,
        status: "Open"
    };

    batches.push(batch);
    writeData("batches", batches);

    res.status(201).json({
        message: "Batch created successfully!",
        batch: batch
    });
});

app.post("/pickup/verify", requireRole("KitchenStaff", "BusinessOwner"), (req, res) => {
    const orders = readData("orders");

    const pickupCode = req.body.pickupCode;
    const staff = req.loggedInUser;

    const order = orders.find(o => o.pickupCode === pickupCode);

    if (!pickupCode || !order) {
        return res.status(404).json({
            error: "Invalid pickup code"
        });
    }

    if (staff.role === "BusinessOwner" && !ownerOwnsOrder(staff.id, order)) {
        return res.status(403).json({ error: "This pickup belongs to another business" });
    }

    if (order.pickupCodeUsed === true || order.status === "Collected") {
        return res.status(400).json({
            error: "Pickup code has already been used"
        });
    }

    if (order.status !== "Ready") {
        return res.status(400).json({
            error: "Order is not ready for pickup"
        });
    }

    order.pickupCodeUsed = true;
    order.status = "Collected";

    if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
    }

    order.statusHistory.push({
        status: "Collected",
        timestamp: new Date().toISOString()
    });

    writeData("orders", orders);

    res.json({
        message: "Pickup verified successfully",
        orderId: order.id,
        status: order.status
    });
});

app.get("/reports/owner/:ownerId", requireRole("BusinessOwner"), (req, res) => {
    if (Number(req.params.ownerId) !== req.loggedInUser.id) {
        return res.status(403).json({
            error: "You can only view your own business reports"
        });
    }
    const orders = readData("orders");
    const batches = readData("batches");
    const productionTasks = readData("productionTasks");
    const ingredients = readData("ingredients");
    const recipes = readData("recipes");

    const ownerId = Number(req.params.ownerId);

    const ownerBatches = batches.filter(b => b.ownerId === ownerId);
    const batchIds = ownerBatches.map(b => b.id);

    const ownerOrders = orders.filter(o => batchIds.includes(o.batchId));
    const ownerTasks = productionTasks.filter(t => batchIds.includes(t.batchId));

    const completedTasks = ownerTasks.filter(t => t.status === "Completed").length;
    const pendingTasks = ownerTasks.filter(t => t.status !== "Completed").length;

    let totalRevenue = 0;
    let totalOrdered = 0;
    let totalCollected = 0;
    let cancelledOrders = 0;

    for (const order of ownerOrders) {
        if (order.status === "Cancelled") {
            cancelledOrders++;
            continue;
        }

        totalRevenue += order.totalAmount;

        for (const item of order.items) {
            totalOrdered += item.quantity;

            if (order.status === "Collected") {
                totalCollected += item.quantity;
            }
        }
    }

    let estimatedIngredientCost = 0;
    for (const order of ownerOrders) {
        if (order.status === "Cancelled") {
            continue;
        }

        for (const item of order.items) {
            const recipe = recipes.find(r =>
                r.productId === item.productId &&
                r.variantId === item.variantId &&
                r.ownerId === ownerId
            );

            if (!recipe) {
                continue;
            }

            for (const recipeIngredient of recipe.ingredients) {
                const ingredient = ingredients.find(i =>
                    i.id === recipeIngredient.ingredientId
                );

                if (!ingredient) {
                    continue;
                }

                const quantityNeeded =
                    (recipeIngredient.quantity / recipe.yieldQuantity) * item.quantity;

                estimatedIngredientCost +=
                    quantityNeeded * (ingredient.costPerUnit || 0);
            }
        }
    }

    estimatedIngredientCost = Math.round(estimatedIngredientCost * 1000) / 1000;

    res.json({
        ownerId: ownerId,
        totalOrders: ownerOrders.length,
        confirmedOrders: ownerOrders.filter(o => o.status === "Confirmed").length,
        preparingOrders: ownerOrders.filter(o => o.status === "Preparing").length,
        readyOrders: ownerOrders.filter(o => o.status === "Ready").length,
        collectedOrders: ownerOrders.filter(o => o.status === "Collected").length,
        cancelledOrders: cancelledOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrdered: totalOrdered,
        totalCollected: totalCollected,
        totalProductionTasks: ownerTasks.length,
        completedProductionTasks: completedTasks,
        pendingProductionTasks: pendingTasks,
        estimatedIngredientCost: estimatedIngredientCost
    });
});


app.post("/stockHolds", requireRole("Customer"), (req, res) => {
    const holds = readData("stockHolds");
    const ingredients = readData("ingredients");

    const ingredientId = Number(req.body.ingredientId);
    const quantity = Number(req.body.quantity);
    const customerId = req.loggedInUser.id;

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "Invalid quantity" });
    }

    const ingredient = ingredients.find(i => i.id === ingredientId);

    if (!ingredient) {
        return res.status(404).json({ error: "Ingredient not found" });
    }

    const now = Date.now();

    // Remove expired holds
    const activeHolds = holds.filter(h => new Date(h.expiresAt).getTime() > now);

    // Calculate how much is already held
    let heldQuantity = 0;

    for (const hold of activeHolds) {
        if (hold.ingredientId === ingredientId) {
            heldQuantity += hold.quantity;
        }
    }

    const available =
        ingredient.quantityAvailable -
        ingredient.quantityReserved -
        heldQuantity;

    if (quantity > available) {
        return res.status(400).json({
            error: "Not enough ingredient stock available"
        });
    }

    const newHold = {
        id: holds.length === 0 ? 1 : Math.max(...holds.map(h => h.id)) + 1,
        customerId: customerId,
        ingredientId: ingredientId,
        quantity: quantity,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(now + 10 * 60 * 1000).toISOString()
    };

    activeHolds.push(newHold);
    writeData("stockHolds", activeHolds);

    res.status(201).json({
        message: "Stock held successfully for 10 minutes",
        hold: newHold
    });
});

app.delete("/stockHolds/expired", requireRole("Administrator"), (req, res) => {
    const holds = readData("stockHolds");

    const now = Date.now();

    const activeHolds = holds.filter(h =>
        new Date(h.expiresAt).getTime() > now
    );

    const removedCount = holds.length - activeHolds.length;

    writeData("stockHolds", activeHolds);

    res.json({
        message: "Expired stock holds removed",
        removedCount: removedCount
    });
});

app.delete("/stockHolds/:id", requireRole("Customer"), (req, res) => {
    const holds = readData("stockHolds");

    const holdId = Number(req.params.id);
    const customerId = req.loggedInUser.id;

    const hold = holds.find(h => h.id === holdId);

    if (!hold) {
        return res.status(404).json({
            error: "Stock hold not found"
        });
    }

    if (hold.customerId !== customerId) {
        return res.status(403).json({
            error: "This hold does not belong to this customer"
        });
    }

    const updatedHolds = holds.filter(h => h.id !== holdId);

    writeData("stockHolds", updatedHolds);

    res.json({
        message: "Stock hold released successfully"
    });
});




app.listen(3000, () => {
    console.log("BatchBite server running at http://localhost:3000");
});
