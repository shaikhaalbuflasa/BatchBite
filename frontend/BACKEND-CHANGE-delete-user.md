# Backend change request: delete user endpoint

**For:** backend owner (`backend/server.js`)
**Why:** Phase 2 rubric "creation and deletion" — the Manage Users page has a Delete button that calls this route.
Without it, the button shows "Deleting accounts is not available on this server yet. Deactivate the account instead."

**Where:** paste the block below in `server.js` directly **after** the `app.put("/admin/users/:id", ...)` route and **before** `app.get("/users", ...)`.

**Rules it follows (same style as the existing admin route):**
- Administrator only (403 otherwise)
- 404 if the user does not exist
- 400 if the Administrator tries to delete their own account
- 409 if the account has orders, products, batches, pickup slots, ingredients, recipes or assigned kitchen tasks — those accounts should be deactivated instead so order history stays complete
- On success: removes the user, their sessions and their notifications

```js
// Administrator: permanently delete an account.
// Accounts that already have orders, business records or kitchen tasks are
// not deleted (so order history stays complete); deactivate those instead.
app.delete("/admin/users/:id", (req, res) => {
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

    if (user.id === admin.id) {
        return res.status(400).json({
            error: "Administrator cannot delete their own account"
        });
    }

    const linkedRecords =
        readData("orders").some(o => o.customerId === userId) ||
        ["products", "batches", "pickupSlots", "ingredients", "recipes"]
            .some(name => readData(name).some(item => item.ownerId === userId)) ||
        readData("productionTasks").some(t => t.assignedTo === userId);

    if (linkedRecords) {
        return res.status(409).json({
            error: "This account has orders or business records, so it cannot be deleted. Deactivate it instead."
        });
    }

    writeData("users", users.filter(u => u.id !== userId));
    writeData("sessions", readData("sessions").filter(s => s.userId !== userId));
    writeData("notifications", readData("notifications").filter(n => n.userId !== userId));

    res.json({
        message: "User deleted successfully",
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
});
```
