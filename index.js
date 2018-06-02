/**
 * A service for automated deployment from Docker Hub to Docker Swarm
 * https://docs.docker.com/docker-hub/webhooks/
 */
process.env.PORT = process.env.PORT || 3000

const express = require('express')
const bodyParser = require('body-parser')
const child_process = require('child_process')
const app = express()
const services = require(`./config.json`)[process.env.CONFIG || 'production']
const logger = require('./lib/logger')('DOCKER-DEPLOY')

if (!process.env.TOKEN || !process.env.USERNAME || !process.env.PASSWORD)
  return logger.error('Error: You must set a TOKEN, USERNAME and PASSWORD as environment variables.')

const dockerCommand = process.env.DOCKER || '/usr/bin/docker'
const token = process.env.TOKEN || ''
const username = process.env.USERNAME || ''
const password = process.env.PASSWORD || ''

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/webhook/:token', (req, res) => {
  if (!req.params.token || req.params.token != token) {
    logger.log('Webhook called with invalid or missing token.')
    return res.status(401).send('Access Denied: Token Invalid\n').end()
  }

  // Send response back right away if token was valid
  res.send('OK')

  const payload = req.body
  const image = `${payload.repository.repo_name}:${payload.push_data.tag}`

  if (!services[image]) return logger.log(`Received updated for "${image}" but not configured to handle updates for this image.`)

  const service = services[image].service

  // Make sure we are logged in to be able to pull the image
  child_process.exec(`${dockerCommand} login -u "${username}" -p "${password}"`,
    (error, stdout, stderr) => {
      if (error) return logger.error(error)

      // Deploy the image and force a restart of the associated service
      logger.log(`Deploying ${image} to ${service}…`)
      child_process.exec(`${dockerCommand} service update ${service} --force --with-registry-auth --image=${image}`,
        (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to deploy ${image} to ${service}!`)
          return logger.error(error)
        }
        logger.log(`Deployed ${image} to ${service} successfully and restarted the service.`)
    })
  })
})

app.all('*', (req, res) => {
  res.send('')
})

app.listen(process.env.PORT, err => {
  if (err) throw err
  logger.log(`Listening for webhooks on http://localhost:${process.env.PORT}/webhook/${token}`)
})