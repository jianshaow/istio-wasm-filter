from flask import Flask, request, jsonify
from requests.auth import HTTPBasicAuth

app = Flask(__name__)


@app.route('/authenticate', methods=['POST'])
def test():
    return jsonify({'status': 200})


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0")
