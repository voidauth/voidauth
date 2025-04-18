import { randomUUID } from "crypto";
import type { Knex } from "knex";
import { generate } from "generate-password";
import type { User } from "@shared/db/User";
import type { Group, UserGroup } from "@shared/db/Group";
import bcrypt from 'bcrypt'
import { ADMIN_GROUP, ADMIN_USER } from "@shared/constants";

const password = generate({
  length: 32,
  numbers: true
})

const initialAdminUser: User = {
  id: randomUUID(),
  username: ADMIN_USER,
  name: "Auth Admin",
  email: `admin@localhost`,
  passwordHash: await bcrypt.hash(password, 10),
  emailVerified: true,
  approved: true,
  createdAt: Date(),
  updatedAt: Date(),
}

const initialAdminGroup: Group = {
  id: randomUUID(),
  name: ADMIN_GROUP,
  createdBy: initialAdminUser.id,
  updatedBy: initialAdminUser.id,
  createdAt: Date(),
  updatedAt: Date()
}

export async function up(knex: Knex): Promise<void> {
  await knex.table<User>("user").insert(initialAdminUser)

  await knex.table<Group>("group").insert(initialAdminGroup)

  await knex.table<UserGroup>("user_group").insert({
    userId: initialAdminUser.id,
    groupId: initialAdminGroup.id,
    createdBy: initialAdminUser.id,
    updatedBy: initialAdminUser.id,
    createdAt: Date(),
    updatedAt: Date()
  })

  console.log("")
  console.log("")
  console.log("The following is the default Admin username and password,")
  console.log("These will not be shown again.")
  console.log("")
  console.log(initialAdminUser.username)
  console.log(password)
  console.log("")
}


export async function down(knex: Knex): Promise<void> {
  await knex.table("user").delete().where({ username: initialAdminUser.username })
  await knex.table("group").delete().where({ name: initialAdminGroup.name })
}

