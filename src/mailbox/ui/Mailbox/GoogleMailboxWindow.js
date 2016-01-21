import './mailboxWindow.less'
const React = require('react')
const ReactDOM = require('react-dom')
const flux = {
  mailbox: require('../../stores/mailbox'),
  google: require('../../stores/google')
}
const remote = window.nativeRequire('remote')
const url = window.nativeRequire('url')
const shell = remote.require('shell')
const app = remote.require('app')
const session = remote.require('session')

/* eslint-disable react/prop-types */

module.exports = React.createClass({
  displayName: 'GoogleMailboxWindow',

  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  componentDidMount: function () {
    this.lastSetZoomFactor = 1.0
    this.isMounted = true

    flux.mailbox.S.listen(this.mailboxesChanged)
    ReactDOM.findDOMNode(this).appendChild(this.renderWebviewDOMNode())
  },

  componentWillUnmount: function () {
    this.isMounted = false
    flux.mailbox.S.unlisten(this.mailboxesChanged)
  },

  /* **************************************************************************/
  // Data lifecycle
  /* **************************************************************************/

  getInitialState: function () {
    const mailboxStore = flux.mailbox.S.getState()
    return {
      mailbox: mailboxStore.get(this.props.mailbox_id),
      isActive: mailboxStore.activeId() === this.props.mailbox_id
    }
  },

  mailboxesChanged: function (store) {
    if (this.isMounted === false) { return }
    this.setState({
      mailbox: store.get(this.props.mailbox_id),
      isActive: store.activeId() === this.props.mailbox_id
    })
  },

  shouldComponentUpdate: function (nextProps, nextState) {
    this.updateWebviewDOMNode(nextProps, nextState)
    return false // we never update this element
  },

  /* **************************************************************************/
  // Events
  /* **************************************************************************/

  /**
  * Handles a new window open request
  * @param evt: the event
  * @param webview: the webview element the event came from
  */
  handleOpenNewWindow: function (evt, webview) {
    const host = url.parse(evt.url).host
    const whitelist = [
      'inbox.google.com',
      'mail.google.com'
    ]
    if (whitelist.findIndex(w => host === w) === -1) {
      shell.openExternal(evt.url)
    } else {
      webview.src = evt.url
    }
  },

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  /**
  * For some reason react strips out the partition keyword, so we have to generate
  * the dom node. Also because it reloads the element when active changes and we need
  * the ref to the node for binding electron events we sink down to normal html
  */
  renderWebviewDOMNode: function () {
    // Setup the session that will be used
    const partition = 'persist:' + this.state.mailbox.id
    var ses = session.fromPartition(partition)
    ses.setDownloadPath(app.getPath('downloads'))

    // Build the dom
    const webview = document.createElement('webview')
    webview.setAttribute('preload', './native/injection/google')
    webview.setAttribute('partition', partition)
    webview.setAttribute('src', this.state.mailbox.url)
    webview.setAttribute('data-mailbox', this.state.mailbox.id)
    webview.classList.add('mailbox-window')

    // Active state
    if (this.state.isActive) {
      webview.classList.add('active')
    }

    // Bind events
    webview.addEventListener('dom-ready', () => {
      // Cut out some google stuff we don't want
      webview.insertCSS('.gb_9a { visibility: hidden !important; }')

      // Set the zoom factor
      webview.send('zoom-factor-set', { value: this.state.mailbox.zoomFactor })
      this.lastSetZoomFactor = this.state.mailbox.zoomFactor
    })


    // Handle messages from the page
    webview.addEventListener('ipc-message', (evt) => {
      if (evt.channel.type === 'page-click') {
        flux.google.A.syncUnreadCounts([this.state.mailbox])
      }
    })
    webview.addEventListener('new-window', (evt) => {
      this.handleOpenNewWindow(evt, webview)
    })
    webview.addEventListener('will-navigate', (evt) => {
      // the lamest protection again dragging files into the window
      // but this is the only thing I could find that leaves file drag working
      if (evt.url.indexOf('file://') === 0) {
        webview.setAttribute('src', this.state.mailbox.url)
      }
    })

    return webview
  },

  /**
  * Update the dom node manually so that react doesn't keep re-loading our
  * webview element when it decides that it wants to re-render
  * @param nextProps: the next props
  * @param nextState: the next state
  */
  updateWebviewDOMNode: function(nextProps, nextState) {
    if (!nextState.mailbox) { return }
    
    const webview = ReactDOM.findDOMNode(this).getElementsByTagName('webview')[0]

    // Change the active state
    if (this.state.isActive !== nextState.isActive) {
      webview.classList[nextState.isActive ? 'add' : 'remove']('active')
    }

    if (this.state.mailbox !== nextState.mailbox) {
      // Set the zoom factor
      if (nextState.mailbox.zoomFactor !== this.lastSetZoomFactor) {
        webview.send('zoom-factor-set', { value: nextState.mailbox.zoomFactor })
        this.lastSetZoomFactor = nextState.mailbox.zoomFactor
      }
    }
  },

  /**
  * Renders the app
  */
  render: function () {
    if (!this.state.mailbox) { return false }

    return <div {...this.props}></div>
  }
})
